import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type TestContext } from "vitest";
import type { TokenEstimate } from "../src/contracts.js";
import { startServer } from "../src/server.js";

const script = fileURLToPath(
  new URL("./fixtures/pricing-mcp.mjs", import.meta.url),
);

async function fixture(t: TestContext) {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/mcp-pricing-"));
  const report = path.join(root, "traffic.txt");
  t.onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    connection: (mode = "small") => ({
      command: process.execPath,
      args: [script, report, mode],
    }),
    async write(name: string, value: unknown) {
      const file = path.join(root, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(value));
    },
    traffic: () => fs.readFile(report, "utf8").catch(() => ""),
    async start(analyzeMcp = true) {
      const session = await startServer({
        root,
        includeUser: false,
        analyzeMcp,
      });
      t.onTestFinished(async () => {
        session.server.closeAllConnections();
        await new Promise<void>((resolve) =>
          session.server.close(() => resolve()),
        );
      });
      const headers = { Authorization: `Bearer ${session.token}` };
      const read = async (
        query = "client=claude&model=gpt-6.1-sol",
      ): Promise<TokenEstimate> => {
        const response = await fetch(
          new URL(`/api/token-estimate?${query}`, session.url),
          { headers },
        );
        expect(response.status).toBe(200);
        return response.json();
      };
      return {
        read,
        async ready() {
          await expect
            .poll(
              async () =>
                (await read("client=all&model=gpt-6.1-sol")).mcp?.pending,
            )
            .toBe(false);
        },
        refresh: () =>
          fetch(new URL("/api/scan?refresh=1", session.url), { headers }),
      };
    },
  };
}

test("all agents share one catalog, retain client tool filters and promote shared components once", async (t) => {
  const f = await fixture(t);
  const shared = f.connection();
  await f.write(".mcp.json", {
    mcpServers: {
      docs: {
        ...shared,
        enabled_tools: ["read", "write"],
        disabled_tools: ["write"],
      },
    },
  });
  await f.write(".cursor/mcp.json", {
    mcpServers: {
      docs: {
        ...shared,
        enabled_tools: ["read", "admin"],
        disabled_tools: ["write"],
      },
    },
  });
  const api = await f.start();
  await api.ready();
  const claude = await api.read();
  const cursor = await api.read(
    "client=cursor&model=gpt-6.1-sol&mcp_cursor=eager",
  );
  const union = await api.read("client=all&model=gpt-6.1-sol&mcp_cursor=eager");
  expect(claude.mcp?.servers[0]?.toolCount).toBe(1);
  expect(cursor.mcp?.servers[0]?.toolCount).toBe(2);
  expect(claude.startup.tokens).toBe(1);
  expect(claude.onDemand.tokens).toBeGreaterThan(0);
  expect(union.mcp?.servers).toHaveLength(2);
  expect(union.entries).toHaveLength(6);
  expect(new Set(union.entries.map((entry) => entry.id)).size).toBe(6);
  expect(union.startup).toEqual(cursor.startup);
  expect(union.onDemand.tokens).toBe(0);
  for (const row of union.mcp!.servers) {
    if (row.clients.includes("cursor")) {
      expect(row.startup).toEqual(union.startup);
    } else {
      expect(row.startup?.tokens).toBe(
        claude.startup.tokens + claude.onDemand.tokens,
      );
    }
    expect(row.onDemand?.tokens).toBe(0);
  }
  const traffic = (await f.traffic()).split("\n");
  expect(
    traffic.filter((method) => method === "small:tools/list"),
  ).toHaveLength(1);
  expect(
    traffic.filter((method) => method === "small:initialize"),
  ).toHaveLength(1);
});

test("identical server names on different connections retain separate atoms and costs", async (t) => {
  const f = await fixture(t);
  await f.write(".mcp.json", {
    mcpServers: { docs: { ...f.connection("first"), enabled_tools: ["read"] } },
  });
  await f.write(".cursor/mcp.json", {
    mcpServers: {
      docs: { ...f.connection("second"), enabled_tools: ["read"] },
    },
  });
  const api = await f.start();
  await api.ready();
  const one = await api.read(
    "client=claude&model=gpt-6.1-sol&mcp_claude=eager",
  );
  const union = await api.read(
    "client=all&model=gpt-6.1-sol&mcp_claude=eager&mcp_cursor=eager&mcp_copilot=eager",
  );
  expect(union.mcp?.servers.map((row) => row.name)).toEqual(["docs", "docs"]);
  expect(union.entries).toHaveLength(6);
  expect(new Set(union.entries.map((entry) => entry.id)).size).toBe(6);
  expect(union.startup.tokens).toBe(one.startup.tokens * 2);
  expect(union.startup.inputCost).toBeCloseTo(one.startup.inputCost * 2, 12);
  expect(
    (await f.traffic())
      .split("\n")
      .filter((line) => line.endsWith(":tools/list")),
  ).toHaveLength(2);
});

test("MCP rows and summaries use the global long-context rate for their own portion", async (t) => {
  const f = await fixture(t);
  await f.write(".mcp.json", {
    mcpServers: {
      first: f.connection("large-first"),
      second: f.connection("large-second"),
    },
  });
  const api = await f.start();
  await api.ready();
  const deferred = await api.read("client=claude&model=claude-haiku-5-5");
  expect(deferred.startup.tokens).toBe(2);
  expect(deferred.onDemand.tokens).toBeGreaterThan(100_000);
  expect(deferred.startup.inputCost).toBeCloseTo((2 * 0.1) / 1_000_000, 12);
  expect(deferred.onDemand.inputCost).toBeCloseTo(
    (deferred.onDemand.tokens * 0.5) / 1_000_000,
    12,
  );
  for (const row of deferred.mcp!.servers) {
    expect(row.onDemand!.tokens).toBeLessThan(100_000);
    expect(row.onDemand!.inputCost).toBeCloseTo(
      (row.onDemand!.tokens * 0.5) / 1_000_000,
      12,
    );
  }
  for (const entry of deferred.entries) {
    const rate = entry.portion === "startup" ? 0.1 : 0.5;
    expect(entry.inputCost).toBeCloseTo((entry.tokens * rate) / 1_000_000, 12);
  }
  const eager = await api.read(
    "client=claude&model=claude-haiku-5-5&mcp_claude=eager",
  );
  expect(eager.startup.tokens).toBe(
    deferred.startup.tokens + deferred.onDemand.tokens,
  );
  expect(eager.startup.inputCost).toBeCloseTo(
    (eager.startup.tokens * 0.5) / 1_000_000,
    12,
  );
  expect(eager.onDemand.tokens).toBe(0);
  for (const row of eager.mcp!.servers) {
    expect(row.startup!.inputCost).toBeCloseTo(
      (row.startup!.tokens * 0.5) / 1_000_000,
      12,
    );
  }
  expect(
    (await f.traffic())
      .split("\n")
      .filter((line) => line.endsWith(":tools/list")),
  ).toHaveLength(2);
});

test("empty catalogs have observed zeroes, unavailable catalogs stay unknown and disabled analysis never launches", async (t) => {
  const f = await fixture(t);
  await f.write(".mcp.json", {
    mcpServers: {
      empty: f.connection("empty"),
      unavailable: f.connection("unavailable"),
    },
  });
  const disabled = await f.start(false);
  const off = await disabled.read();
  expect(off.mcp).toMatchObject({
    enabled: false,
    pending: false,
  });
  expect(off.mcp?.servers).toHaveLength(2);
  expect(
    off.mcp!.servers.every(
      (row) =>
        row.startup === null && row.onDemand === null && row.toolCount === null,
    ),
  ).toBe(true);
  expect(await f.traffic()).toBe("");
  expect((await disabled.refresh()).status).toBe(200);
  await disabled.ready();
  expect(await f.traffic()).toBe("");
  const enabled = await f.start();
  await enabled.ready();
  const result = await enabled.read();
  expect(result.mcp!.servers.find((row) => row.name === "empty")).toMatchObject(
    {
      status: "ready",
      toolCount: 0,
      partial: false,
      startup: { tokens: 0, inputCost: 0 },
      onDemand: { tokens: 0, inputCost: 0 },
    },
  );
  expect(
    result.mcp!.servers.find((row) => row.name === "unavailable"),
  ).toMatchObject({
    status: "unavailable",
    toolCount: null,
    startup: null,
    onDemand: null,
  });
  expect(result.mcp?.complete).toBe(false);
});
