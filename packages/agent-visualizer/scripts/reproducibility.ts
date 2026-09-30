import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve("dist");
async function hashes(): Promise<Record<string, string>> {
  const entries: [string, string][] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else
        entries.push([
          path.relative(root, file),
          createHash("sha256")
            .update(await fs.readFile(file))
            .digest("hex"),
        ]);
    }
  }
  await walk(root);
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error("Run this check using npm run test:reproducibility");
const before = await hashes();
execFileSync(process.execPath, [npmCli, "run", "build"], { stdio: "inherit" });
assert.deepEqual(
  await hashes(),
  before,
  "Repeated builds changed distributable files",
);
console.log("Repeated builds produce identical distribution files.");
