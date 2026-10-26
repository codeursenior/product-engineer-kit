import type {
  Client,
  McpEstimate,
  McpLoading,
  McpProfiles,
  TokenEntry,
} from "../contracts.js";
import type { Snapshot } from "../scan/types.js";
import type { McpTarget, McpToolDefinition } from "./types.js";

const documented = {
  claude: {
    label: "Claude Code: on demand",
    source: "https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search",
    assumption:
      "Compatible current Claude Code; tool names and server instructions upfront. Actual version not verified.",
  },
  cursor: {
    label: "Cursor: dynamic discovery",
    source:
      "https://cursor.com/blog/dynamic-context-discovery#4-efficiently-loading-only-the-mcp-tools-needed",
    assumption:
      "Current dynamic discovery; tool names upfront. Actual version not verified.",
  },
  copilot: {
    label: "Copilot: VS Code tool search",
    source:
      "https://code.visualstudio.com/blogs/2026/06/17/improving-token-efficiency-in-github-copilot",
    assumption:
      "VS Code with a compatible model; names and descriptions upfront. CLI configuration is not classified automatically.",
  },
  codex: {
    label: "Codex: tool search",
    source:
      "https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs",
    assumption:
      "Current native Codex with a compatible model. Source descriptions and generated discovery wrappers may be unavailable.",
  },
} satisfies Record<
  Client,
  { label: string; source: string; assumption: string }
>;

/** Serialize only catalog data; never evaluate schemas or resolve references. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
      );
    return item;
  });
}

function definition(tool: McpToolDefinition): string {
  return stable({
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    ...(tool.title ? { title: tool.title } : {}),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  });
}

export function parseMcpProfiles(params: URLSearchParams): McpProfiles {
  const profiles: McpProfiles = {};
  for (const client of Object.keys(documented) as Client[]) {
    const choice = params.get(`mcp_${client}`);
    if (choice === null) continue;
    if (!["documented", "eager", "deferred"].includes(choice))
      throw new Error("Select a supported MCP loading profile.");
    profiles[client] = choice as McpLoading;
  }
  return profiles;
}

export function mcpInventory(
  snapshot: Snapshot,
  clients: Client[],
  choices: McpProfiles,
): {
  entries: TokenEntry[];
  coverage: McpEstimate;
  membership: Map<string, Set<string>>;
} {
  const analysis = snapshot.mcpAnalysis;
  const entries = new Map<string, TokenEntry>();
  const membership = new Map<string, Set<string>>();
  const servers: McpEstimate["servers"] = [];
  const targets = (snapshot.mcpTargets ?? []).filter((t) =>
    t.clients.some((c) => clients.includes(c)),
  );
  // Public component IDs must never expose a fingerprint derived from credentials.
  const catalogSources = new Map<string, string>();
  for (const target of snapshot.mcpTargets ?? [])
    if (!catalogSources.has(target.catalogId))
      catalogSources.set(target.catalogId, target.id);
  for (const target of targets) {
    const result = analysis?.results.get(target.id) ??
      target.issue ?? {
        status: "unavailable" as const,
        detail: analysis?.enabled
          ? "Catalog unavailable."
          : "MCP analysis is disabled.",
      };
    const row: McpEstimate["servers"][number] = {
      id: target.id,
      name: target.name,
      path: target.path,
      clients: target.clients.filter((c) => clients.includes(c)),
      status: result.status,
      detail: result.detail,
      toolCount: null,
      partial: false,
      startup: null,
      onDemand: null,
      ...("collectedAt" in result ? { collectedAt: result.collectedAt } : {}),
    };
    servers.push(row);
    const ids = new Set<string>();
    membership.set(target.id, ids);
    if (result.status !== "ready" || !("tools" in result) || !result.tools)
      continue;
    const tools = result.tools.filter(
      (tool) =>
        (!target.enabledTools || target.enabledTools.includes(tool.name)) &&
        !target.disabledTools?.includes(tool.name),
    );
    row.toolCount = tools.length;
    const add = (part: string, text: string, startup: boolean) => {
      if (!text) return;
      const id = `mcp:${catalogSources.get(target.catalogId)}:${part}`;
      ids.add(id);
      const previous = entries.get(id);
      if (previous?.portion === "startup") return;
      entries.set(id, {
        id,
        name: target.name,
        mcpServerId: target.id,
        path: target.path,
        scope: target.scope,
        kind: "mcp",
        portion: startup ? "startup" : "on-demand",
        tokens: Math.ceil(Array.from(text).length / 4),
        words: text.match(/\S+/gu)?.length ?? 0,
        bytes: Buffer.byteLength(text),
        inputCost: 0,
      });
    };
    for (const client of row.clients) {
      const choice = choices[client] ?? "documented";
      const mode = effectiveMode(target, client, choice);
      if (mode === "unknown") {
        row.partial = true;
        row.detail =
          "Catalog available; loading depends on unavailable agent settings. Select a loading profile.";
        continue;
      }
      const eager = mode === "eager";
      if (client === "codex") {
        add(`source:${target.name}`, target.name, true);
        if (!eager) {
          row.partial = true;
          row.detail =
            "Source name counted; initial source description and generated discovery text are not fully observable.";
        }
      }
      const instructions =
        "instructions" in result ? result.instructions : undefined;
      if (instructions) {
        if (eager || client === "claude")
          add("instructions", instructions, true);
        else {
          row.partial = true;
          row.detail =
            "Server instructions are available, but their loading is not fully documented for this profile.";
        }
      }
      for (const tool of tools) {
        add(`name:${tool.name}`, tool.name, eager || client !== "codex");
        add(
          `description:${tool.name}`,
          tool.description ?? "",
          eager || client === "copilot",
        );
        add(`definition:${tool.name}`, definition(tool), eager);
      }
    }
  }
  return {
    entries: [...entries.values()],
    membership,
    coverage: {
      enabled: analysis?.enabled ?? false,
      pending: servers.some((s) => s.status === "pending"),
      complete: servers.every(
        (s) =>
          s.status === "disabled" ||
          s.status === "excluded" ||
          (s.status === "ready" && !s.partial),
      ),
      profiles: clients.map((client) => ({
        client,
        choice: choices[client] ?? "documented",
        ...documented[client],
        ...(choices[client] && choices[client] !== "documented"
          ? {
              label:
                choices[client] === "eager"
                  ? "Load all known components upfront"
                  : "Load definitions on demand",
              assumption:
                "User-selected scenario. Installed client behavior is not verified.",
            }
          : {}),
        verifiedAt: "2026-10-26",
      })),
      servers,
    },
  };
}

function effectiveMode(
  target: McpTarget,
  client: Client,
  choice: McpLoading,
): "eager" | "deferred" | "unknown" {
  if (choice !== "documented") return choice;
  if (client === "copilot" && target.copilotSurface === "cli") return "unknown";
  const loading = target.loadingByClient?.[client] ?? target.loading;
  if (client === "claude" && target.alwaysLoad === true) return "eager";
  if (loading === "conditional") return "unknown";
  if (loading === "eager") return "eager";
  if (client === "claude" && target.alwaysLoad === false) return "deferred";
  return loading ?? "deferred";
}
