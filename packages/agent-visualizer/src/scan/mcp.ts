import { parse as jsonc, type ParseError } from "jsonc-parser";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as toml } from "smol-toml";
import type { Client, McpServer, Scope } from "../contracts.js";
import type { McpTarget } from "../mcp/types.js";
import type { ScanEnvironment } from "./types.js";
import { errorCode, id, inside, record, slash } from "./values.js";
export async function discoverMcp(
  projectConfigs: Set<string>,
  env: ScanEnvironment,
): Promise<{ servers: McpServer[]; targets: McpTarget[] }> {
  const { root, home, codexHome, includeUser, allowed, display, warnings } =
    env;
  const mcp: McpServer[] = [];
  const targets: McpTarget[] = [];
  const priorities = new Map<string, number>();
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
      const server: McpServer = {
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
      };
      mcp.push(server);
      targets.push(connectionTarget(server, config, env));
      priorities.set(
        server.id,
        origin === "Project-local configuration in user settings"
          ? 40
          : scope === "user"
            ? 10
            : slash(file).endsWith("/.vscode/mcp.json")
              ? 35
              : 30,
      );
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

  const claudeEnvironment: Record<string, unknown> = {};
  for (const file of [
    ...(includeUser ? [path.join(home, ".claude/settings.json")] : []),
    path.join(root, ".claude/settings.json"),
    path.join(root, ".claude/settings.local.json"),
  ])
    Object.assign(claudeEnvironment, record((await readConfig(file)).env));
  const search = claudeEnvironment.ENABLE_TOOL_SEARCH;
  const claudeLoading =
    search === "false"
      ? "eager"
      : search === "true"
        ? "deferred"
        : typeof search === "string" &&
            /^auto(?::(?:100|[0-9]{1,2}))?$/.test(search)
          ? "conditional"
          : undefined;
  if (claudeLoading)
    for (const target of targets) {
      if (target.clients.includes("claude"))
        target.loadingByClient = {
          ...target.loadingByClient,
          claude: claudeLoading,
        };
    }

  const winners = new Map<string, McpTarget>();
  for (const target of targets) {
    if (target.issue?.status === "excluded") continue;
    for (const client of target.clients) {
      const key = `${client}:${target.name}`;
      const current = winners.get(key);
      if (!current || priorities.get(target.id)! > priorities.get(current.id)!)
        winners.set(key, target);
    }
  }
  for (const target of targets) {
    if (target.issue?.status === "excluded") continue;
    const selected = target.clients.filter(
      (client) => winners.get(`${client}:${target.name}`) === target,
    );
    if (selected.length) target.clients = selected;
    else
      target.issue = {
        status: "excluded",
        detail: "Overridden by a higher-priority configuration.",
      };
  }
  return {
    servers: mcp.sort((a, b) => a.name.localeCompare(b.name)),
    targets,
  };
}

function connectionTarget(
  server: McpServer,
  config: Record<string, unknown>,
  env: ScanEnvironment,
): McpTarget {
  let unresolved = false;
  const environmentValue = (name: string): string => {
    const value = process.env[name];
    if (value === undefined) unresolved = true;
    return value ?? "";
  };
  const expand = (value: string): string =>
    value.replace(/\$\{([^}]+)\}/g, (_, reference: string) => {
      if (reference === "workspaceFolder") return env.root;
      if (reference === "userHome") return env.home;
      const name = reference.startsWith("env:")
        ? reference.slice(4)
        : reference;
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?::-.*)?$/.test(name)) {
        unresolved = true;
        return "";
      }
      const [variable, fallback] = name.split(/:-(.*)/s);
      const resolved = variable && process.env[variable];
      if (resolved !== undefined) return resolved;
      if (fallback !== undefined) return fallback;
      return environmentValue(variable ?? "");
    });
  const strings = (input: unknown): Record<string, string> => {
    const result: Record<string, string> = {};
    if (
      input !== undefined &&
      (!input || typeof input !== "object" || Array.isArray(input))
    )
      unresolved = true;
    for (const [name, value] of Object.entries(record(input))) {
      if (typeof value === "string") result[name] = expand(value);
      else unresolved = true;
    }
    return result;
  };
  const stringArray = (input: unknown): string[] | undefined => {
    if (input === undefined) return undefined;
    if (
      Array.isArray(input) &&
      input.every((value) => typeof value === "string")
    )
      return input;
    unresolved = true;
    return undefined;
  };
  const childEnv = strings(config.env);
  for (const name of stringArray(config.env_vars) ?? [])
    childEnv[name] = environmentValue(name);
  const headers = {
    ...strings(config.headers),
    ...strings(config.http_headers),
  };
  for (const [header, variable] of Object.entries(
    record(config.env_http_headers),
  )) {
    if (typeof variable === "string")
      headers[header] = environmentValue(variable);
    else unresolved = true;
  }
  if (typeof config.bearer_token_env_var === "string")
    headers.Authorization = `Bearer ${environmentValue(config.bearer_token_env_var)}`;
  const command =
    typeof config.command === "string" ? expand(config.command) : undefined;
  const args = (stringArray(config.args) ?? []).map(expand);
  const cwd = path.resolve(
    env.root,
    typeof config.cwd === "string" ? expand(config.cwd) : ".",
  );
  const url = typeof config.url === "string" ? expand(config.url) : undefined;
  const connection = { command, args, cwd, env: childEnv, url, headers };
  return {
    ...connection,
    id: server.id,
    catalogId: id(
      JSON.stringify(
        { ...connection, transport: server.transport },
        (_, value: unknown) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(
                Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
              )
            : value,
      ),
    ),
    name: server.name,
    path: server.path,
    scope: server.scope,
    clients: [...server.clients],
    transport: server.transport,
    enabledTools: stringArray(config.enabled_tools),
    disabledTools: stringArray(config.disabled_tools),
    alwaysLoad:
      typeof config.alwaysLoad === "boolean" ? config.alwaysLoad : undefined,
    loadingByClient:
      server.clients.includes("copilot") && config.deferTools === "never"
        ? { copilot: "eager" }
        : undefined,
    copilotSurface: server.clients.includes("copilot")
      ? server.path.includes(".copilot/")
        ? "cli"
        : "vscode"
      : undefined,
    issue: !server.configured
      ? { status: "disabled", detail: "Disabled in configuration." }
      : server.origin === "Nested project configuration"
        ? {
            status: "excluded",
            detail: "Nested configuration is not active at the project root.",
          }
        : unresolved
          ? {
              status: "unavailable",
              detail: "Configuration or authentication value unavailable.",
            }
          : server.transport === "Unknown"
            ? {
                status: "unavailable",
                detail: "Unsupported connection configuration.",
              }
            : undefined,
  };
}
