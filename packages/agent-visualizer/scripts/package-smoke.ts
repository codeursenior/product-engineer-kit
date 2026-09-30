import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// This runner uses only Node APIs so CI can execute it on Node 20 without dev dependencies.
const nodeDirectory = path.dirname(process.execPath);
const npmCandidates = [
  process.env.npm_execpath,
  path.join(nodeDirectory, "node_modules/npm/bin/npm-cli.js"),
  path.resolve(nodeDirectory, "../lib/node_modules/npm/bin/npm-cli.js"),
];
let npmCli: string | undefined;
for (const candidate of npmCandidates) {
  if (!candidate) continue;
  try {
    await fs.access(candidate);
    npmCli = candidate;
    break;
  } catch {
    // Node distributions use different npm locations on Windows and Unix.
  }
}
if (!npmCli) throw new Error("Cannot locate npm alongside this Node runtime");
const resolvedNpmCli = npmCli;
function npm(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [resolvedNpmCli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120000,
  });
}
let archive = process.argv[2];
if (!archive) {
  await fs.mkdir(".local", { recursive: true });
  const result: unknown = JSON.parse(
    npm(
      ["pack", "--json", "--ignore-scripts", "--pack-destination", ".local"],
      process.cwd(),
    ),
  );
  if (
    !Array.isArray(result) ||
    !result[0] ||
    typeof result[0].filename !== "string"
  )
    throw new Error("npm pack did not return an archive");
  archive = path.resolve(".local", result[0].filename);
}
archive = path.resolve(archive);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "boyscout-package-"));
let child: ReturnType<typeof spawn> | undefined;
try {
  await fs.writeFile(path.join(directory, "package.json"), '{"private":true}');
  npm(
    [
      "install",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      archive,
    ],
    directory,
  );
  const installed = path.join(directory, "node_modules/@codeursenior/boyscout");
  const cli = path.join(installed, "dist/cli.js");
  const pkg: {
    version: string;
    bin: { boyscout: string };
    dependencies: Record<string, string>;
  } = JSON.parse(
    await fs.readFile(path.join(installed, "package.json"), "utf8"),
  );
  assert.equal(pkg.bin.boyscout, "dist/cli.js");
  assert.equal(
    npm(["exec", "--offline", "--", "boyscout", "--version"], directory).trim(),
    pkg.version,
  );
  assert.ok((await fs.readFile(cli, "utf8")).startsWith("#!/usr/bin/env node"));
  assert.equal(
    execFileSync(process.execPath, [cli, "--version"], {
      cwd: directory,
      encoding: "utf8",
    }).trim(),
    pkg.version,
  );
  assert.match(
    execFileSync(process.execPath, [cli, "--help"], {
      cwd: directory,
      encoding: "utf8",
    }),
    /boyscout ui/,
  );
  assert.ok(
    !Object.keys(pkg.dependencies).some((name) =>
      /angular|typescript|vitest|playwright/.test(name),
    ),
  );
  await assert.rejects(
    fs.stat(path.join(directory, "node_modules/@angular/core")),
    { code: "ENOENT" },
  );
  const fixture = path.join(directory, "fixture");
  await fs.mkdir(fixture);
  await fs.writeFile(path.join(fixture, "AGENTS.md"), "# Packaged fixture");
  child = spawn(
    process.execPath,
    [cli, "ui", fixture, "--project-only", "--no-open"],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  const running = child;
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Packaged CLI did not start")),
      15000,
    );
    let output = "";
    running.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    running.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Packaged CLI exited: ${code}`));
    });
    running.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]+/);
      if (match?.[0]) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
  const location = new URL(url),
    token = new URLSearchParams(location.hash.slice(1)).get("token");
  const response = await fetch(location.origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /app-root/);
  for (const match of html.matchAll(
    /(?:src|href)="([^"]+\.(?:js|css|svg))"/g,
  )) {
    const asset = match[1];
    if (!asset) continue;
    const response = await fetch(new URL(asset, location.origin));
    assert.equal(response.status, 200, asset);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await fetch(location.origin + "/api/scan")).status, 401);
  const scan: { nodes: { name: string }[] } = await (
    await fetch(location.origin + "/api/scan", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  assert.deepEqual(
    scan.nodes.map((node) => node.name),
    ["AGENTS.md"],
  );
  console.log(
    `Packed CLI smoke passed on ${process.platform} ${process.version}`,
  );
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) =>
      child?.once("exit", () => resolve()),
    );
    child.kill();
    await exited;
  }
  // directory is the mkdtemp result under os.tmpdir(), never a caller-supplied path.
  await fs.rm(directory, { recursive: true, force: true });
}
