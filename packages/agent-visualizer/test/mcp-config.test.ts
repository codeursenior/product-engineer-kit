import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { expect, test } from "vitest";
import type { ScanData, TokenEstimate } from "../src/contracts.js";
import { required } from "../src/scan/values.js";
import { startServer } from "../src/server.js";

test("inventories MCP configuration without starting processes, connecting, or adding catalog tokens", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/mcp-passive-"));
  let connections = 0;
  const endpoint = http.createServer((_request, response) => {
    connections++;
    response.writeHead(500).end();
  });
  await new Promise<void>((resolve) =>
    endpoint.listen(0, "127.0.0.1", resolve),
  );
  t.onTestFinished(async () => {
    endpoint.closeAllConnections();
    await new Promise<void>((resolve) => endpoint.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const address = endpoint.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const marker = path.join(root, "process-started");
  await fs.writeFile(path.join(root, "AGENTS.md"), "Project instructions");
  await fs.writeFile(
    path.join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        remote: {
          url: `http://127.0.0.1:${address.port}/mcp`,
          headers: { Authorization: "PRIVATE_FIXTURE_TOKEN" },
        },
        local: {
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`,
          ],
        },
      },
    }),
  );
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const base = required(url.split("#")[0]);
  const headers = { Authorization: `Bearer ${token}` };
  for (const suffix of ["", "?refresh=1"]) {
    const data: ScanData = await (
      await fetch(base + "api/scan" + suffix, { headers })
    ).json();
    expect(
      data.mcp.map(({ name, transport, status }) => ({
        name,
        transport,
        status,
      })),
    ).toEqual([
      { name: "local", transport: "stdio", status: "Not verified" },
      { name: "remote", transport: "HTTP", status: "Not verified" },
    ]);
    expect(JSON.stringify(data)).not.toContain("PRIVATE_FIXTURE_TOKEN");
    expect(JSON.stringify(data)).not.toContain(marker);
  }
  const estimate: TokenEstimate = await (
    await fetch(base + "api/token-estimate?client=all&model=gpt-6.1-sol", {
      headers,
    })
  ).json();
  expect(estimate.entries.map((entry) => entry.kind)).toEqual(["instruction"]);
  expect(estimate).not.toHaveProperty("mcp");
  expect(connections).toBe(0);
  await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
});
