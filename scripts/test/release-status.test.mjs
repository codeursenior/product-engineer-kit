import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { compareFiles, nextVersion, unpackFiles } from "../release-status.mjs";

const kitDirectory = fileURLToPath(new URL("../../", import.meta.url));

test("version-only metadata and line endings do not require a release", () => {
  const published = new Map([
    [
      "package.json",
      Buffer.from('{"name":"@codeursenior/boyscout","version":"0.1.0"}'),
    ],
    ["src/cli.js", Buffer.from("current code\n")],
  ]);
  const local = new Map([
    [
      "package.json",
      Buffer.from('{"version":"0.1.1","name":"@codeursenior/boyscout"}'),
    ],
    ["src/cli.js", Buffer.from("current code\r\n")],
  ]);

  assert.deepEqual(compareFiles(local, published), []);
  local.set("src/cli.js", Buffer.from("updated code"));
  assert.deepEqual(compareFiles(local, published), ["src/cli.js"]);
});

test("the real npm archive excludes tests and includes the built UI", () => {
  const output = execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "pack",
      "--workspace",
      "@codeursenior/boyscout",
      "--dry-run",
      "--json",
      "--ignore-scripts",
      "--cache",
      path.join(kitDirectory, ".local", "npm-cache"),
    ],
    { cwd: kitDirectory, encoding: "utf8" },
  );
  const paths = JSON.parse(output)[0].files.map((file) => file.path);
  assert.ok(paths.includes("public/app.js"));
  assert.ok(paths.includes("src/cli.js"));
  assert.ok(
    !paths.some(
      (filePath) => filePath.startsWith("test/") || filePath.startsWith("ui/"),
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
  header.write("package/src/cli.js", 0);
  header.write("00000000016\0", 124);
  header[156] = 48;
  const padded = Buffer.alloc(512);
  contents.copy(padded);
  const files = unpackFiles(
    gzipSync(Buffer.concat([header, padded, Buffer.alloc(1024)])),
  );
  assert.equal(files.get("src/cli.js").toString(), "published code");
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
  const actual = execFileSync(process.execPath, ["src/cli.js", "--version"], {
    cwd: packageDirectory,
    encoding: "utf8",
  }).trim();
  assert.equal(actual, expected);
});
