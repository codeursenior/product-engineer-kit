import http from "node:http";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { collectMcpCatalog, startMcpAnalysis } from "../src/mcp/collector.js";
import type { McpTarget } from "../src/mcp/types.js";

const target: McpTarget = {
  id: "fixture",
  catalogId: "shared",
  name: "Fixture",
  path: ".mcp.json",
  scope: "project",
  clients: ["codex"],
  transport: "HTTP",
};
const tool = {
  name: "read",
  description: "Read a file",
  inputSchema: { type: "object" },
};

async function fixture(
  handle: (message: {
    id?: number;
    method: string;
    params?: Record<string, unknown>;
  }) => unknown,
) {
  const methods: string[] = [];
  const headers: http.IncomingHttpHeaders[] = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (!body) {
      res.writeHead(405).end();
      return;
    }
    const message = JSON.parse(body);
    methods.push(message.method);
    headers.push(req.headers);
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const result = handle(message);
    if (result === undefined) return;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, ...result }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  return {
    target: { ...target, url: `http://127.0.0.1:${address.port}/mcp` },
    methods,
    headers,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
function handshake(method: string) {
  if (method === "server/discover")
    return { error: { code: -32601, message: "Legacy fixture" } };
  if (method === "initialize")
    return {
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1.0" },
        instructions: "Review first",
      },
    };
  return undefined;
}

test("collects instructions and every tool page without calling a tool", async () => {
  const f = await fixture(
    (message) =>
      handshake(message.method) ?? {
        result:
          message.params?.cursor === undefined
            ? { tools: [tool], nextCursor: "" }
            : {
                tools: [
                  {
                    ...tool,
                    name: "write",
                    icons: [{ src: "https://example.invalid/icon" }],
                    _meta: { secret: true },
                  },
                ],
              },
      },
  );
  try {
    const result = await collectMcpCatalog(
      f.target,
      new AbortController().signal,
    );
    expect(result.status).toBe("ready");
    expect(result.instructions).toBe("Review first");
    expect(result.tools?.map((entry) => entry.name)).toEqual(["read", "write"]);
    expect(result.tools?.[1]).not.toHaveProperty("icons");
    expect(result.tools?.[1]).not.toHaveProperty("_meta");
    expect(f.methods).toEqual([
      "server/discover",
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/list",
    ]);
  } finally {
    await f.close();
  }
});

test("coalesces identical connections and performs no work when disabled", async () => {
  const f = await fixture(
    (message) => handshake(message.method) ?? { result: { tools: [tool] } },
  );
  try {
    const run = startMcpAnalysis([
      f.target,
      { ...f.target, id: "alias", name: "Alias" },
    ]);
    expect(run.state.running).toBe(true);
    await run.done;
    expect(run.state.running).toBe(false);
    expect(run.state.results.get("fixture")?.status).toBe("ready");
    expect(run.state.results.get("alias")?.status).toBe("ready");
    expect(f.methods.filter((method) => method === "tools/list")).toHaveLength(
      1,
    );
    const disabled = startMcpAnalysis([f.target], { enabled: false });
    await disabled.done;
    expect(disabled.state.results.get("fixture")?.status).toBe("disabled");
    expect(f.methods.filter((method) => method === "tools/list")).toHaveLength(
      1,
    );
  } finally {
    await f.close();
  }
});

test.each([
  { name: "repeated cursor", page: { tools: [], nextCursor: "loop" } },
  { name: "duplicate tool", page: { tools: [tool, tool] } },
  { name: "malformed tool", page: { tools: [{ name: "invalid" }] } },
])("rejects an incomplete catalogue: $name", async ({ page }) => {
  const f = await fixture(
    (message) => handshake(message.method) ?? { result: page },
  );
  try {
    const result = await collectMcpCatalog(
      f.target,
      new AbortController().signal,
    );
    expect(result.status).toBe("unavailable");
    expect(result.tools).toBeUndefined();
    expect(result.instructions).toBeUndefined();
    expect(result.detail).not.toContain("loop");
  } finally {
    await f.close();
  }
});

test("finishes a stalled server within its deadline and sanitizes failures", async () => {
  const f = await fixture((message) => handshake(message.method));
  try {
    const run = startMcpAnalysis([f.target], { serverTimeoutMs: 100 });
    await run.done;
    expect(run.state.results.get("fixture")).toMatchObject({
      status: "unavailable",
      detail: "MCP analysis timed out.",
    });
    expect(JSON.stringify([...run.state.results])).not.toContain(f.target.url);
  } finally {
    await f.close();
  }
});

test("cancellation closes a pending analysis and does not publish a catalogue", async () => {
  const f = await fixture((message) => handshake(message.method));
  try {
    const run = startMcpAnalysis([f.target]);
    run.cancel();
    await run.done;
    expect(run.state.running).toBe(false);
    expect(run.state.results.get("fixture")?.status).toBe("unavailable");
    expect(run.state.results.get("fixture")?.tools).toBeUndefined();
  } finally {
    await f.close();
  }
});

test("a server without tools capability has a successfully observed empty catalogue", async () => {
  const f = await fixture((message) => {
    const response = handshake(message.method);
    return message.method === "initialize"
      ? {
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            serverInfo: { name: "no-tools", version: "1" },
            instructions: "Instructions only",
          },
        }
      : response;
  });
  try {
    const result = await collectMcpCatalog(
      f.target,
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      status: "ready",
      tools: [],
      instructions: "Instructions only",
    });
    expect(f.methods).not.toContain("tools/list");
  } finally {
    await f.close();
  }
});

test("executes one stdio process and closes it after listing definitions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-collector-"));
  const fixturePath = path.resolve("test/fixtures/mcp-stdio.mjs");
  const report = path.join(directory, "report.json");
  try {
    const result = await collectMcpCatalog(
      {
        ...target,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath, report],
        cwd: directory,
        env: { MCP_FIXTURE_VALUE: "explicit" },
      },
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      status: "ready",
      instructions: "Local instructions",
      tools: [tool],
    });
    const records = (await fs.readFile(report, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records[0]).toMatchObject({ env: "explicit" });
    expect(records.slice(1).map((record) => record.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(() => process.kill(records[0].pid, 0)).toThrow();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("connects to a legacy SSE endpoint and sends credentials only to that origin", async () => {
  let stream: http.ServerResponse | undefined;
  const methods: string[] = [];
  const authorization: (string | undefined)[] = [];
  const server = http.createServer(async (req, res) => {
    authorization.push(req.headers.authorization);
    if (req.method === "GET") {
      stream = res;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
      });
      res.write("event: endpoint\ndata: /messages\n\n");
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    methods.push(message.method);
    res.writeHead(202).end();
    if (message.id !== undefined) {
      const response = handshake(message.method) ?? {
        result: { tools: [tool] },
      };
      stream?.write(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, ...response })}\n\n`,
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  try {
    const result = await collectMcpCatalog(
      {
        ...target,
        transport: "SSE",
        url: `http://127.0.0.1:${address.port}/events`,
        headers: { Authorization: "Bearer fixture-secret" },
      },
      new AbortController().signal,
    );
    expect(result.status).toBe("ready");
    expect(result.tools).toEqual([tool]);
    expect(methods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(
      authorization.every((value) => value === "Bearer fixture-secret"),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  } finally {
    stream?.end();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a catalogue exceeding the byte limit cannot become a complete result", async () => {
  const f = await fixture(
    (message) =>
      handshake(message.method) ?? {
        result: {
          tools: [{ ...tool, description: "x".repeat(4 * 1024 * 1024) }],
        },
      },
  );
  try {
    const run = startMcpAnalysis([f.target], { serverTimeoutMs: 2000 });
    await run.done;
    expect(run.state.results.get("fixture")?.status).toBe("unavailable");
    expect(run.state.results.get("fixture")?.tools).toBeUndefined();
  } finally {
    await f.close();
  }
});

test("rejects deeply nested schemas before they can reach token serialization", async () => {
  let inputSchema: Record<string, unknown> = { type: "string" };
  for (let depth = 0; depth < 80; depth++)
    inputSchema = { type: "object", properties: { child: inputSchema } };
  const f = await fixture(
    (message) =>
      handshake(message.method) ?? {
        result: { tools: [{ ...tool, inputSchema }] },
      },
  );
  try {
    const result = await collectMcpCatalog(
      f.target,
      new AbortController().signal,
    );
    expect(result).toEqual({
      status: "unavailable",
      detail: "MCP catalogue exceeds the nesting limit.",
    });
    expect(result.tools).toBeUndefined();
    expect(result.instructions).toBeUndefined();
  } finally {
    await f.close();
  }
});

test("rejects cross-origin redirects before forwarding configured credentials", async () => {
  let received = 0;
  const sink = http.createServer((_req, res) => {
    received++;
    res.writeHead(401).end();
  });
  sink.listen(0, "127.0.0.1");
  await once(sink, "listening");
  const sinkAddress = sink.address();
  if (!sinkAddress || typeof sinkAddress === "string")
    throw new Error("No sink port");
  const source = http.createServer((_req, res) => {
    res
      .writeHead(307, {
        Location: `http://127.0.0.1:${sinkAddress.port}/other`,
      })
      .end();
  });
  source.listen(0, "127.0.0.1");
  await once(source, "listening");
  const sourceAddress = source.address();
  if (!sourceAddress || typeof sourceAddress === "string")
    throw new Error("No source port");
  try {
    const result = await collectMcpCatalog(
      {
        ...target,
        url: `http://127.0.0.1:${sourceAddress.port}/mcp`,
        headers: { Authorization: "Bearer fixture-secret" },
      },
      new AbortController().signal,
    );
    expect(result.status).toBe("unavailable");
    expect(received).toBe(0);
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  } finally {
    source.closeAllConnections();
    sink.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => source.close(() => resolve())),
      new Promise<void>((resolve) => sink.close(() => resolve())),
    ]);
  }
});

test("does not start an OAuth flow after an authentication refusal", async () => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests++;
    res
      .writeHead(401, {
        "WWW-Authenticate":
          'Bearer resource_metadata="https://example.invalid/secret"',
      })
      .end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  try {
    const result = await collectMcpCatalog(
      { ...target, url: `http://127.0.0.1:${address.port}/mcp` },
      new AbortController().signal,
    );
    expect(result).toEqual({
      status: "unavailable",
      detail: "Authentication unavailable.",
    });
    expect(requests).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
