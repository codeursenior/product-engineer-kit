import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverAssets } from "./scan/assets.js";
import { collectFiles } from "./scan/collect.js";
import { buildGraph } from "./scan/graph.js";
import { discoverMcp } from "./scan/mcp.js";
import type { ScanEnvironment, ScanOptions, Snapshot } from "./scan/types.js";
import { inside, slash } from "./scan/values.js";

/** Inventory only: never executes instructions, hooks, skills or MCP commands. */
export async function scanProject(
  project: string,
  options: ScanOptions = {},
): Promise<Snapshot> {
  const home = options.home ?? os.homedir();
  const includeUser = options.includeUser ?? true;
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? path.join(home, ".codex");
  const root = await fs.realpath(path.resolve(project));
  if (!(await fs.stat(root)).isDirectory())
    throw new Error("Choose a folder to scan.");
  const allowed = [
    root,
    ...(includeUser
      ? [
          path.join(home, ".agents"),
          path.join(home, ".claude"),
          path.join(home, ".cursor"),
          codexHome,
        ]
      : []),
  ];
  const env: ScanEnvironment = {
    root,
    home,
    codexHome,
    includeUser,
    allowed,
    warnings: [],
    display(file, scope) {
      if (scope === "user" && process.platform === "win32") return file;
      return scope === "user" && inside(home, file)
        ? "~/" + slash(path.relative(home, file))
        : slash(path.relative(root, file)) || path.basename(root);
    },
  };
  const { entries, projectConfigs, inspected, capped } =
    await collectFiles(env);
  const { context, rules, skills, content, editable, addContext } =
    await discoverAssets(entries, env);
  const edges = buildGraph(entries, context, addContext, env);
  const mcp = await discoverMcp(projectConfigs, env);
  return {
    data: {
      project: { name: path.basename(root), path: root },
      scannedAt: new Date().toISOString(),
      nodes: [...context.values()],
      rules: [...rules.values()].sort((a, b) => a.name.localeCompare(b.name)),
      edges,
      skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
      mcp,
      warnings: [...new Set(env.warnings)],
      limits: { includeUser, scannedFiles: inspected, truncated: capped },
    },
    content,
    editable,
  };
}
