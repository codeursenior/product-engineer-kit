import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [report, mode = "small"] = process.argv.slice(2);
appendFileSync(report, `${mode}:started\n`);
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  appendFileSync(report, `${mode}:${message.method}\n`);
  if (message.id === undefined) continue;
  const response = { jsonrpc: "2.0", id: message.id };
  if (message.method === "initialize") {
    response.result = {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "pricing-fixture", version: "1" },
    };
  } else if (message.method === "tools/list" && mode !== "unavailable") {
    response.result = {
      tools:
        mode === "empty"
          ? []
          : mode.startsWith("large")
            ? [
                {
                  name: "read",
                  description: "x".repeat(200_000),
                  inputSchema: { type: "object" },
                },
              ]
            : [
                { name: "read", description: "find" },
                { name: "write", description: "save" },
                { name: "admin", description: "root" },
              ].map((tool) => ({
                ...tool,
                inputSchema: { type: "object" },
              })),
    };
  } else {
    response.error = { code: -32601, message: "Catalog unavailable" };
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
