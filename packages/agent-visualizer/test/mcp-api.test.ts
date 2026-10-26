import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { expect, test } from "vitest";
import type { TokenEstimate } from "../src/contracts.js";
import { startServer } from "../src/server.js";

test("unclassified instructions stay unknown even when the catalog has no tools", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/mcp-empty-"));
  const program = `require('readline').createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;const result=m.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'},instructions:'abcd'}:{tools:[]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n')})`;
  await fs.mkdir(path.join(root, ".claude"));
  await fs.writeFile(
    path.join(root, ".claude/settings.json"),
    JSON.stringify({ env: { ENABLE_TOOL_SEARCH: "auto:5" } }),
  );
  await fs.writeFile(
    path.join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        empty: { command: process.execPath, args: ["-e", program] },
      },
    }),
  );
  const session = await startServer({ root, includeUser: false });
  t.onTestFinished(async () => {
    session.server.closeAllConnections();
    await new Promise<void>((resolve) => session.server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const endpoint = new URL(
    "/api/token-estimate?client=claude&model=gpt-6.1-sol",
    session.url,
  );
  const read = async (): Promise<TokenEstimate> =>
    (
      await fetch(endpoint, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
    ).json();
  await expect
    .poll(async () => (await read()).mcp?.servers[0]?.status)
    .toBe("ready");
  const result = (await read()).mcp?.servers[0];
  expect(result).toMatchObject({
    toolCount: 0,
    partial: true,
    startup: null,
    onDemand: null,
  });
  endpoint.searchParams.set("mcp_claude", "eager");
  expect((await read()).mcp?.servers[0]?.startup?.tokens).toBe(1);
});

test("a failed local bind never starts a configured MCP process", async () => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/mcp-bind-"));
  const marker = path.join(root, "pid.txt");
  const occupied = http.createServer();
  occupied.listen(0, "127.0.0.1");
  await once(occupied, "listening");
  const address = occupied.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  try {
    await fs.writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          fixture: {
            command: process.execPath,
            args: [
              "-e",
              "require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
              marker,
            ],
          },
        },
      }),
    );
    await expect(
      startServer({ root, includeUser: false, port: address.port }),
    ).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await fs.readFile(marker, "utf8").catch(() => null)).toBeNull();
  } finally {
    const pid = await fs.readFile(marker, "utf8").catch(() => null);
    if (pid) {
      try {
        process.kill(Number(pid));
      } catch {
        /* Already exited. */
      }
    }
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("automatically estimates MCP context, reprices cached catalogs and refreshes once", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/mcp-api-"));
  const script = path.join(root, "fixture.mjs");
  const traffic = path.join(root, "traffic.txt");
  await fs.writeFile(
    script,
    `
import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
createInterface({input:process.stdin}).on('line', async line => {
  const m=JSON.parse(line); appendFileSync(process.argv[2],m.method+'\\n');
  if(m.id===undefined)return;
  let result;
  if(m.method==='initialize') {
    await new Promise(r=>setTimeout(r,120));
    result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'},instructions:'abcd'};
  } else if(m.method==='tools/list') result={tools:[{name:'find',description:'abcd',inputSchema:{type:'object'}}]};
  else { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Unavailable'}})+'\\n');return; }
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
});`,
  );
  await fs.writeFile(
    path.join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        docs: {
          command: process.execPath,
          args: [script, traffic],
          env: { PRIVATE_FIXTURE: "secret-sentinel" },
        },
      },
    }),
  );
  const session = await startServer({ root, includeUser: false });
  t.onTestFinished(async () => {
    session.server.closeAllConnections();
    await new Promise<void>((resolve) => session.server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const headers = { Authorization: `Bearer ${session.token}` };
  const endpoint = new URL(
    "/api/token-estimate?client=claude&model=gpt-6.1-sol",
    session.url,
  );
  expect((await fetch(endpoint)).status).toBe(401);
  const read = async (): Promise<TokenEstimate> =>
    (await fetch(endpoint, { headers })).json();
  expect((await read()).mcp?.enabled).toBe(true);
  await expect
    .poll(async () => (await read()).mcp?.servers[0]?.status)
    .toBe("ready");
  const deferred = await read();
  expect(deferred.startup.tokens).toBe(2);
  expect(deferred.onDemand.tokens).toBeGreaterThan(1);
  expect(deferred.mcp?.profiles[0]?.choice).toBe("documented");
  expect(deferred.mcp?.servers[0]?.toolCount).toBe(1);
  expect(JSON.stringify(deferred)).not.toContain("secret-sentinel");
  expect(JSON.stringify(deferred)).not.toContain("inputSchema");
  endpoint.searchParams.set("mcp_claude", "eager");
  const eager = await read();
  expect(eager.startup.tokens).toBe(
    deferred.startup.tokens + deferred.onDemand.tokens,
  );
  expect(eager.onDemand.tokens).toBe(0);
  endpoint.searchParams.set("model", "claude-opus-5-5");
  expect((await read()).startup.inputCost).toBeCloseTo(
    eager.startup.inputCost * 2,
    10,
  );
  endpoint.searchParams.set("client", "all");
  const union = await read();
  expect(union.startup.tokens + union.onDemand.tokens).toBe(
    eager.startup.tokens,
  );
  expect(union.mcp?.servers).toHaveLength(1);
  const before = await fs.readFile(traffic, "utf8");
  expect(
    before.split("\n").filter((method) => method === "initialize"),
  ).toHaveLength(1);
  expect(before).not.toContain("tools/call");
  expect(before).not.toContain("resources/read");
  await fetch(new URL("/api/scan?refresh=1", session.url), { headers });
  await expect.poll(async () => (await read()).mcp?.pending).toBe(false);
  expect(
    (await fs.readFile(traffic, "utf8"))
      .split("\n")
      .filter((method) => method === "initialize"),
  ).toHaveLength(2);
  endpoint.searchParams.set("mcp_claude", "invalid");
  expect((await fetch(endpoint, { headers })).status).toBe(400);
  session.server.once("request", () => {
    session.server.close();
    session.server.closeAllConnections();
  });
  await fetch(new URL("/api/scan?refresh=1", session.url), { headers }).catch(
    () => undefined,
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(
    (await fs.readFile(traffic, "utf8"))
      .split("\n")
      .filter((method) => method === "initialize"),
  ).toHaveLength(2);
});
