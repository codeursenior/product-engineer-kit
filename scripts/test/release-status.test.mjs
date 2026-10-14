import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  compareFiles,
  nextVersion,
  publishedPackage,
  unpackFiles,
} from "../release-status.mjs";

const kitDirectory = fileURLToPath(new URL("../../", import.meta.url));

test("version-only metadata and line endings do not require a release", () => {
  const published = new Map([
    [
      "package.json",
      Buffer.from('{"name":"@codeursenior/pek","version":"0.1.0"}'),
    ],
    ["dist/cli.js", Buffer.from("current code\n")],
  ]);
  const local = new Map([
    [
      "package.json",
      Buffer.from('{"version":"0.1.1","name":"@codeursenior/pek"}'),
    ],
    ["dist/cli.js", Buffer.from("current code\r\n")],
  ]);

  assert.deepEqual(compareFiles(local, published), []);
  local.set("dist/cli.js", Buffer.from("updated code"));
  assert.deepEqual(compareFiles(local, published), ["dist/cli.js"]);
});

test("the real npm archive excludes tests and includes the built UI", () => {
  const output = execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "pack",
      "--workspace",
      "@codeursenior/pek",
      "--dry-run",
      "--json",
      "--ignore-scripts",
      "--cache",
      path.join(kitDirectory, ".local", "npm-cache"),
    ],
    { cwd: kitDirectory, encoding: "utf8" },
  );
  const paths = JSON.parse(output)[0].files.map((file) => file.path);
  assert.ok(paths.includes("dist/browser/index.html"));
  assert.ok(
    paths.some((filePath) => /^dist\/browser\/main-[\w-]+\.js$/.test(filePath)),
  );
  assert.ok(paths.includes("dist/cli.js"));
  assert.ok(
    !paths.some(
      (filePath) =>
        /^(test|ui|src|scripts|\.local)\//.test(filePath) ||
        filePath.endsWith(".map"),
    ),
  );
});

test("retry uses an unpublished version and a published version gets a new patch", () => {
  assert.equal(nextVersion("0.1.1", "0.1.0"), "0.1.1");
  assert.equal(nextVersion("0.1.0", "0.1.0"), "0.1.1");
  assert.equal(nextVersion("0.1.0", "0.1.2"), "0.1.3");
  assert.equal(nextVersion("0.2.0", "0.1.9"), "0.2.0");
});

test("published tar entries are read as package files", () => {
  const contents = Buffer.from("published code");
  const header = Buffer.alloc(512);
  header.write("package/dist/cli.js", 0);
  header.write("00000000016\0", 124);
  header[156] = 48;
  const padded = Buffer.alloc(512);
  contents.copy(padded);
  const files = unpackFiles(
    gzipSync(Buffer.concat([header, padded, Buffer.alloc(1024)])),
  );
  assert.equal(files.get("dist/cli.js").toString(), "published code");
});

test("CLI reports the version in its own package manifest", () => {
  const packageDirectory = path.join(
    kitDirectory,
    "packages",
    "agent-visualizer",
  );
  const expected = JSON.parse(
    readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
  ).version;
  const actual = execFileSync(process.execPath, ["dist/cli.js", "--version"], {
    cwd: packageDirectory,
    encoding: "utf8",
  }).trim();
  assert.equal(actual, expected);
});

test("a missing PEK package keeps the local version for first publication and retries", async () => {
  const published = await publishedPackage(async (url) => {
    assert.equal(url, "https://registry.npmjs.org/@codeursenior%2fpek/latest");
    return new Response(null, { status: 404 });
  });
  assert.equal(published, null);
  assert.equal(nextVersion("0.1.7", published?.version), "0.1.7");
  assert.deepEqual(
    compareFiles(new Map([["dist/cli.js", Buffer.from("code")]]), new Map()),
    ["dist/cli.js"],
  );
});

test("registry failures and another package's metadata cannot trigger first publication", async () => {
  for (const status of [401, 403, 500]) {
    await assert.rejects(
      publishedPackage(async () => new Response(null, { status })),
      new RegExp(`npm registry returned ${status}`),
    );
  }
  await assert.rejects(
    publishedPackage(async () =>
      Response.json({
        name: "@codeursenior/boyscout",
        version: "0.1.7",
        dist: { tarball: "https://registry.npmjs.org/old.tgz" },
      }),
    ),
    /incomplete PEK metadata/,
  );
});
