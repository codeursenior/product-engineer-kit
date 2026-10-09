import type {
  Client,
  ContextNode,
  McpServer,
  Rule,
  Scope,
  Skill,
} from "../src/contracts";
export type AssetTab = "context" | "rules" | "skills" | "mcp";
export type Tab = AssetTab | "optimizer";
export type Row = ContextNode | Rule | Skill | McpServer;
export interface Selection {
  tab: AssetTab;
  row: Row;
}
export const labels: Record<Client, string> = {
  cursor: "Cursor",
  claude: "Claude Code",
  codex: "Codex",
  copilot: "GitHub Copilot",
};
export const clientNames: Client[] = ["cursor", "claude", "codex", "copilot"];
export const icons: Record<Client, string> = {
  cursor: "/client-logos/cursor.png",
  claude: "/client-logos/claude.png",
  codex: "/client-logos/chatgpt.webp",
  copilot: "/client-logos/copilot.svg",
};
export const titles: Record<Tab, [string, string]> = {
  optimizer: [
    "Your context iceberg.",
    "Estimate local context and the input cost of loading it once.",
  ],
  context: [
    "See what your agent can find.",
    "Explore the files each coding agent can reach from its context.",
  ],
  rules: [
    "Rules in your workspace.",
    "Browse the rule files discovered for Cursor, Claude Code, and GitHub Copilot.",
  ],
  skills: [
    "Skills your agent can use.",
    "Find each workflow and see which clients discover it.",
  ],
  mcp: [
    "Configured MCP servers.",
    "See where each server is configured and which clients can find it.",
  ],
};
export const paths = (row: Row): string[] =>
  "paths" in row ? row.paths : "aliases" in row ? row.aliases : [row.path];
export const description = (row: Row): string =>
  "description" in row ? row.description : "";
export const invocation = (row: Row, client: Client): string =>
  "invocation" in row ? (row.invocation[client] ?? "") : "";
export function conditions(row: Rule): string {
  if (row.legacy) return "Legacy .cursorrules";
  return (
    [
      row.alwaysApply ? "Cursor alwaysApply" : "",
      row.globs.length ? `Cursor globs: ${row.globs.join(", ")}` : "",
      row.pathsCondition.length
        ? `Claude paths: ${row.pathsCondition.join(", ")}`
        : "",
      row.applyTo.length ? `Copilot applyTo: ${row.applyTo.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "No path condition"
  );
}
export function filterRows<T extends Row>(
  rows: T[],
  scope: Scope | "all",
  client: Client | "all",
  search: string,
): T[] {
  const query = search.toLowerCase();
  return rows.filter(
    (row) =>
      (scope === "all" || row.scope === scope) &&
      (client === "all" || row.clients.includes(client)) &&
      (!query ||
        `${row.name} ${"path" in row ? row.path : row.paths.join(" ")} ${description(row)} ${"globs" in row ? row.globs.join(" ") : ""} ${"pathsCondition" in row ? row.pathsCondition.join(" ") : ""} ${"applyTo" in row ? row.applyTo.join(" ") : ""}`
          .toLowerCase()
          .includes(query)),
  );
}
export const message = (error: unknown): string =>
  error instanceof Error ? error.message : "Unable to read the workspace.";
