import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { scanProject } from "../src/scanner.js";

afterEach(() => vi.unstubAllEnvs());

async function fixture(files: Record<string, string>) {
  await fs.mkdir(".local/test", { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".local/test/mcp-config-"));
  const root = path.join(base, "project"),
    home = path.join(base, "home");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(base, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return {
    root,
    home,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

test("keeps runnable MCP settings private while normalizing environment references", async (t) => {
  vi.stubEnv("MCP_FIXTURE_TOKEN", "private-fixture-token");
  const f = await fixture({
    "project/.codex/config.toml": `[mcp_servers.docs]\nurl = "https://example.invalid/mcp"\nbearer_token_env_var = "MCP_FIXTURE_TOKEN"\nenabled_tools = ["read"]\ndisabled_tools = ["write"]\n[mcp_servers.docs.http_headers]\nX-Tenant = "private-fixture-tenant"\n`,
    "project/.cursor/mcp.json": JSON.stringify({
      mcpServers: {
        local: {
          command: "node",
          args: ["${workspaceFolder}/server.mjs"],
          cwd: "${workspaceFolder}",
          env: { TOKEN: "${env:MCP_FIXTURE_TOKEN}" },
        },
      },
    }),
  });
  t.onTestFinished(f.cleanup);
  const snapshot = await scanProject(f.root, {
    home: f.home,
    includeUser: false,
  });
  const docs = snapshot.mcpTargets?.find((entry) => entry.name === "docs");
  expect(docs).toMatchObject({
    headers: {
      Authorization: "Bearer private-fixture-token",
      "X-Tenant": "private-fixture-tenant",
    },
    enabledTools: ["read"],
    disabledTools: ["write"],
  });
  expect(
    snapshot.mcpTargets?.find((entry) => entry.name === "local"),
  ).toMatchObject({
    command: "node",
    args: [`${f.root}/server.mjs`],
    cwd: f.root,
    env: { TOKEN: "private-fixture-token" },
  });
  expect(JSON.stringify(snapshot.data)).not.toContain("private-fixture");
  expect(JSON.stringify(snapshot.data)).not.toContain("example.invalid");
});

test("uses per-client project precedence and keeps shadowed configurations out of analysis", async (t) => {
  const f = await fixture({
    "project/.mcp.json": JSON.stringify({
      mcpServers: { docs: { command: "portable" } },
    }),
    "project/.vscode/mcp.json": JSON.stringify({
      servers: { docs: { command: "vscode" } },
    }),
    "project/.cursor/mcp.json": JSON.stringify({
      mcpServers: { docs: { command: "project-cursor", disabled: true } },
    }),
    "home/.cursor/mcp.json": JSON.stringify({
      mcpServers: { docs: { command: "user-cursor" } },
    }),
  });
  t.onTestFinished(f.cleanup);
  await fs.writeFile(
    path.join(f.home, ".claude.json"),
    JSON.stringify({
      mcpServers: { docs: { command: "user-claude" } },
      projects: {
        [f.root]: { mcpServers: { docs: { command: "local-claude" } } },
      },
    }),
  );
  const snapshot = await scanProject(f.root, { home: f.home });
  const active = snapshot.mcpTargets?.filter((entry) => !entry.issue);
  expect(active?.map((entry) => [entry.command, entry.clients])).toEqual(
    expect.arrayContaining([
      ["vscode", ["copilot"]],
      ["local-claude", ["claude"]],
    ]),
  );
  expect(active).toHaveLength(2);
  expect(
    snapshot.mcpTargets?.find((entry) => entry.command === "project-cursor")
      ?.issue?.status,
  ).toBe("disabled");
  expect(
    snapshot.mcpTargets?.find((entry) => entry.command === "user-cursor")?.issue
      ?.status,
  ).toBe("excluded");
  expect(snapshot.data.mcp).toHaveLength(6);
});

test("reports unusable inputs and excludes nested MCP commands without executing them", async (t) => {
  const f = await fixture({
    "project/.cursor/mcp.json": JSON.stringify({
      mcpServers: {
        malformed: { command: "node", args: "not-an-array" },
        secretInput: {
          url: "https://example.invalid/mcp",
          headers: { Authorization: "${input:secretToken}" },
        },
        childEnv: { command: "node", env: { ENABLE_TOOL_SEARCH: "false" } },
      },
    }),
    "project/child/.mcp.json": JSON.stringify({
      mcpServers: { nested: { command: "unexecuted-marker" } },
    }),
  });
  t.onTestFinished(f.cleanup);
  const snapshot = await scanProject(f.root, {
    home: f.home,
    includeUser: false,
  });
  expect(
    snapshot.mcpTargets?.find((entry) => entry.name === "malformed")?.issue
      ?.status,
  ).toBe("unavailable");
  expect(
    snapshot.mcpTargets?.find((entry) => entry.name === "secretInput")?.issue
      ?.detail,
  ).toBe("Configuration or authentication value unavailable.");
  expect(
    snapshot.mcpTargets?.find((entry) => entry.name === "nested")?.issue
      ?.status,
  ).toBe("excluded");
  expect(
    snapshot.mcpTargets?.find((entry) => entry.name === "childEnv")?.loading,
  ).toBeUndefined();
  expect(JSON.stringify(snapshot.data)).not.toContain("secretToken");
});

test("shares catalog identity only for equivalent connections and reads explicit agent loading settings", async (t) => {
  const f = await fixture({
    "project/.mcp.json": JSON.stringify({
      mcpServers: {
        docs: { command: "node", args: ["server.mjs"], alwaysLoad: true },
      },
    }),
    "project/.claude/settings.json": JSON.stringify({
      env: { ENABLE_TOOL_SEARCH: "auto:5" },
    }),
    "project/.cursor/mcp.json": JSON.stringify({
      mcpServers: {
        same: { command: "node", args: ["server.mjs"] },
        different: {
          command: "node",
          args: ["server.mjs"],
          env: { TENANT: "other" },
        },
        http: { url: "https://example.invalid/mcp" },
        sse: { url: "https://example.invalid/mcp", type: "sse" },
      },
    }),
    "project/.vscode/mcp.json": JSON.stringify({
      servers: { pinned: { command: "node", deferTools: "never" } },
    }),
  });
  t.onTestFinished(f.cleanup);
  const snapshot = await scanProject(f.root, {
    home: f.home,
    includeUser: false,
  });
  const target = (name: string) =>
    snapshot.mcpTargets!.find((entry) => entry.name === name)!;
  expect(target("docs").catalogId).toBe(target("same").catalogId);
  expect(target("docs").catalogId).not.toBe(target("different").catalogId);
  expect(target("http").catalogId).not.toBe(target("sse").catalogId);
  expect(target("docs")).toMatchObject({
    alwaysLoad: true,
    loadingByClient: { claude: "conditional" },
  });
  expect(target("docs").loading).toBeUndefined();
  expect(target("pinned")).toMatchObject({
    loadingByClient: { copilot: "eager" },
    copilotSurface: "vscode",
  });
});

test("keeps shared server loading overrides specific to each agent", async (t) => {
  const f = await fixture({
    "project/.mcp.json": JSON.stringify({
      mcpServers: { shared: { command: "node", deferTools: "never" } },
    }),
    "project/.claude/settings.json": JSON.stringify({
      env: { ENABLE_TOOL_SEARCH: "true" },
    }),
  });
  t.onTestFinished(f.cleanup);
  const snapshot = await scanProject(f.root, {
    home: f.home,
    includeUser: false,
  });
  const shared = snapshot.mcpTargets!.find((entry) => entry.name === "shared")!;
  expect(shared.clients).toEqual(["claude", "copilot"]);
  expect(shared.loading).toBeUndefined();
  expect(shared.loadingByClient).toEqual({
    copilot: "eager",
    claude: "deferred",
  });
});
