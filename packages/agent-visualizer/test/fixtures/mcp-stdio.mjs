import fs from "node:fs";
import readline from "node:readline";

const report = process.argv[2];
fs.appendFileSync(
  report,
  JSON.stringify({ pid: process.pid, env: process.env.MCP_FIXTURE_VALUE }) +
    "\n",
);
for await (const line of readline.createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  fs.appendFileSync(report, JSON.stringify({ method: message.method }) + "\n");
  if (message.id === undefined) continue;
  const result =
    message.method === "initialize"
      ? {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fixture", version: "1" },
          instructions: "Local instructions",
        }
      : {
          tools: [
            {
              name: "read",
              description: "Read a file",
              inputSchema: { type: "object" },
            },
          ],
        };
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n",
  );
}
