import fs from "node:fs/promises";
import path from "node:path";
import type { Scope } from "../contracts.js";
import type { FileEntry, ScanEnvironment } from "./types.js";
import {
  errorCode,
  id,
  inside,
  INSTRUCTION,
  MARKDOWN,
  MAX_BYTES,
  MAX_FILES,
  required,
} from "./values.js";
const SKIP = new Set([
  "node_modules",
  ".git",
  ".local",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".angular",
  ".venv",
  "vendor",
  "target",
  "plugins",
  "sessions",
  "history",
]);
const AGENT_DIRS = [".agents", ".claude", ".codex", ".cursor", ".github"];

export async function collectFiles(env: ScanEnvironment) {
  const { root, home, codexHome, includeUser, allowed, display, warnings } =
    env;
  const userBases = allowed.slice(1);
  const files = new Map<string, FileEntry>();
  const projectConfigs = new Set<string>();
  let inspected = 0;
  let capped = false;
  async function collect(
    file: string,
    scope: Scope,
    ancestors = new Set<string>(),
    depth = 0,
  ): Promise<void> {
    if (depth > 35 || inspected >= MAX_FILES) {
      capped = true;
      return;
    }
    try {
      const real = await fs.realpath(file);
      if (!allowed.some((base) => inside(base, real))) return;
      const stat = await fs.stat(real);
      if (stat.isDirectory()) {
        if (ancestors.has(real)) return;
        const next = new Set(ancestors).add(real);
        const entries = await fs.readdir(file, { withFileTypes: true });
        for (const entry of entries.sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          if (
            path.basename(file) === ".github" &&
            ["agents", "prompts"].includes(entry.name)
          )
            continue;
          if (
            SKIP.has(entry.name) ||
            (entry.name.startsWith(".") &&
              entry.isDirectory() &&
              !AGENT_DIRS.includes(entry.name) &&
              entry.name !== ".system" &&
              entry.name !== ".vscode")
          )
            continue;
          await collect(path.join(file, entry.name), scope, next, depth + 1);
        }
      } else if (stat.isFile()) {
        inspected++;
        if (
          scope === "project" &&
          /(?:^|[\\/])(?:\.mcp\.json|\.cursor[\\/]mcp\.json|\.codex[\\/]config\.toml|\.vscode[\\/]mcp\.json)$/.test(
            file,
          )
        )
          projectConfigs.add(file);
        if (!MARKDOWN.test(file) && !INSTRUCTION.test(path.basename(file)))
          return;
        if (stat.size > MAX_BYTES) {
          warnings.push(`Skipped large context file: ${display(file, scope)}`);
          return;
        }
        const key = `${scope}:${real}`;
        if (files.has(key)) {
          required(files.get(key)).aliases.push(file);
          return;
        }
        files.set(key, {
          id: id(key),
          real,
          file,
          aliases: [file],
          scope,
          text: await fs.readFile(real, "utf8"),
        });
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(errorCode(error) ?? ""))
        warnings.push(
          `Cannot read ${display(file, scope)} (${errorCode(error) || "invalid file"}).`,
        );
    }
  }
  await collect(root, "project");
  if (includeUser) {
    for (const base of userBases) {
      for (const child of ["skills", "knowledge", "rules", "instructions"])
        await collect(path.join(base, child), "user");
    }
    for (const file of [
      path.join(home, ".claude", "CLAUDE.md"),
      path.join(codexHome, "AGENTS.md"),
      path.join(codexHome, "AGENTS.override.md"),
      path.join(home, ".cursor", "AGENTS.md"),
      path.join(home, ".copilot", "copilot-instructions.md"),
    ])
      await collect(file, "user");
  }
  if (capped)
    warnings.push(
      `Scan stopped at ${MAX_FILES} files or 35 folder levels. Some assets may be missing.`,
    );

  return { entries: [...files.values()], projectConfigs, inspected, capped };
}
