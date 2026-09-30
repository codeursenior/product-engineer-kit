import type { ContextNode, ScanData, Skill } from "../src/contracts";

export const contextFile: ContextNode = {
  id: "context",
  name: "AGENTS.md",
  path: "AGENTS.md",
  aliases: ["AGENTS.md"],
  scope: "project",
  clients: ["codex", "cursor"],
  kind: "instruction",
  bytes: 10,
  lines: 2,
  excerpt: "# Context",
  editTargets: [{ id: "context", path: "AGENTS.md", deletable: true }],
};
export const skill: Skill = {
  id: "skill",
  name: "review",
  description: "Review code",
  scope: "project",
  paths: [".agents/skills/review/SKILL.md", ".claude/skills/review/SKILL.md"],
  clients: ["codex"],
  invocation: { codex: "User only" },
  legacy: false,
  mode: "User only",
  editTargets: [
    { id: "first", path: ".agents/skills/review/SKILL.md", deletable: true },
    { id: "second", path: ".claude/skills/review/SKILL.md", deletable: true },
  ],
};
export function scanData(): ScanData {
  return structuredClone({
    project: { name: "example", path: "/example" },
    scannedAt: "2026-01-01T12:00:00.000Z",
    nodes: [
      contextFile,
      {
        ...contextFile,
        id: "personal",
        scope: "user",
        name: "Personal.md",
        path: "Personal.md",
        aliases: ["Personal.md"],
        clients: ["claude"],
      },
    ],
    edges: [],
    rules: [],
    skills: [skill],
    mcp: [],
    warnings: [],
    limits: { includeUser: true, scannedFiles: 3, truncated: false },
  });
}
