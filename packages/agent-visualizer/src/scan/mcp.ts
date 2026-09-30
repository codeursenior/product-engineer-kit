import { parse as jsonc, type ParseError } from "jsonc-parser";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as toml } from "smol-toml";
import type { Client, McpServer, Scope } from "../contracts.js";
import type { ScanEnvironment } from "./types.js";
import { errorCode, id, inside, record, slash } from "./values.js";
export async function discoverMcp(
  projectConfigs: Set<string>,
  env: ScanEnvironment,
): Promise<McpServer[]> {
  const { root, home, codexHome, includeUser, allowed, display, warnings } =
    env;
  const mcp: McpServer[] = [];
  async function readConfig(
    file: string,
    format = "json",
  ): Promise<Record<string, unknown>> {
    try {
      const real = await fs.realpath(file);
      if (
        ![...allowed, path.join(home, ".claude.json")].some((base) =>
          inside(base, real),
        )
      )
        return {};
      if ((await fs.stat(real)).size > 2 * 1024 * 1024) {
        warnings.push(`Skipped oversized config: ${path.basename(file)}`);
        return {};
      }
      const text = await fs.readFile(real, "utf8");
      if (format === "toml") return record(toml(text));
      const errors: ParseError[] = [];
      const result = jsonc(text, errors, { allowTrailingComma: true });
      if (errors.length) throw new Error("Invalid JSON");
      return record(result);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(errorCode(error) ?? ""))
        warnings.push(
          `Could not parse ${display(file, inside(root, file) ? "project" : "user")}.`,
        );
      return {};
    }
  }
  function addServers(
    servers: unknown,
    file: string,
    scope: Scope,
    clients: Client[],
    origin?: string,
  ) {
    if (!servers || typeof servers !== "object" || Array.isArray(servers))
      return;
    for (const [name, raw] of Object.entries(record(servers))) {
      if (!raw || typeof raw !== "object") continue;
      const config = record(raw);
      const disabled = config.enabled === false || config.disabled === true;
      // Whitelist public fields. Never expose arguments, env, headers, URLs or credentials.
      mcp.push({
        id: id(`${file}:${scope}:${clients.join(",")}:${name}:${origin || ""}`),
        name,
        scope,
        path: display(file, inside(root, file) ? "project" : "user"),
        clients,
        transport: config.url
          ? config.type === "sse"
            ? "SSE"
            : "HTTP"
          : config.command
            ? "stdio"
            : "Unknown",
        status: disabled ? "Disabled" : "Not verified",
        configured: !disabled,
        origin: origin || "File configuration",
      });
    }
  }
  const bases: [string, Scope][] = [[root, "project"]];
  if (includeUser) bases.push([home, "user"]);
  const locations: [string, Client[], string][] = [
    [".cursor/mcp.json", ["cursor"], "json"],
    [".mcp.json", ["claude", "copilot"], "json"],
    [".codex/config.toml", ["codex"], "toml"],
    [".vscode/mcp.json", ["copilot"], "json"],
    [".copilot/mcp-config.json", ["copilot"], "json"],
  ];
  for (const [base, scope] of bases) {
    for (const [rel, clients, format] of locations) {
      if (
        scope === "user" &&
        (rel === ".mcp.json" || rel.startsWith(".vscode"))
      )
        continue;
      if (scope === "project" && rel.startsWith(".copilot")) continue;
      const file =
        scope === "user" && clients.includes("codex")
          ? path.join(codexHome, "config.toml")
          : path.join(base, rel);
      const config = await readConfig(file, format);
      addServers(
        config?.mcpServers || config?.mcp_servers || config?.servers,
        file,
        scope,
        clients,
      );
    }
  }
  for (const file of projectConfigs) {
    const relative = slash(path.relative(root, file));
    if (
      [
        ".mcp.json",
        ".cursor/mcp.json",
        ".codex/config.toml",
        ".vscode/mcp.json",
      ].includes(relative)
    )
      continue;
    const clients: Client[] = relative.endsWith(".cursor/mcp.json")
      ? ["cursor"]
      : relative.endsWith(".codex/config.toml")
        ? ["codex"]
        : relative.endsWith(".vscode/mcp.json")
          ? ["copilot"]
          : ["claude", "copilot"];
    const config = await readConfig(
      file,
      clients.includes("codex") ? "toml" : "json",
    );
    addServers(
      config?.mcpServers || config?.mcp_servers || config?.servers,
      file,
      "project",
      clients,
      "Nested project configuration",
    );
  }
  if (includeUser) {
    const file = path.join(home, ".claude.json");
    const config = await readConfig(file);
    addServers(config?.mcpServers, file, "user", ["claude"]);
    addServers(
      record(record(config.projects)[root]).mcpServers,
      file,
      "project",
      ["claude"],
      "Project-local configuration in user settings",
    );
  }

  return mcp.sort((a, b) => a.name.localeCompare(b.name));
}
