#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { errorCode, record } from "./scan/values.js";
import { startServer } from "./server.js";

const help = `Agent Visualizer · Product Engineer Kit

Usage: npx @codeursenior/pek audit agent [folder] [options]

Explore context, skills and MCP configuration in your default browser.

  --port <number>   Choose a port (default: 4242; 0 for an available port)
  --no-open         Print the URL without opening a browser
  --project-only    Skip user-level assets
  --no-mcp-analysis Skip MCP connections and server startup
  --help, -h        Show this help
  --version, -v     Show the installed version

Local workspace. No telemetry. Ctrl+C to stop.
`;

try {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: "string" },
      "no-open": { type: "boolean" },
      "project-only": { type: "boolean" },
      "no-mcp-analysis": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    allowPositionals: true,
  });
  if (values.version) {
    const { version } = record(
      JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
      ),
    );
    console.log(version);
  } else if (values.help || !positionals.length) {
    console.log(help);
  } else {
    if (
      positionals[0] !== "audit" ||
      positionals[1] !== "agent" ||
      positionals.length > 3
    )
      throw new Error(
        "Expected: pek audit agent [folder]. Use --help for options.",
      );
    const port = values.port === undefined ? 4242 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Port must be an integer between 0 and 65535.");
    const root = path.resolve(positionals[2] || process.cwd());
    console.log(`\n  Agent Visualizer\n  Scanning ${root} ...`);
    const { server, url } = await startServer({
      root,
      port,
      includeUser: !values["project-only"],
      analyzeMcp: !values["no-mcp-analysis"],
    });
    console.log(`\n  ${url}\n\n  Local workspace · Ctrl+C to stop\n`);
    if (!values["no-open"]) {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "rundll32"
            : "xdg-open";
      const args =
        process.platform === "win32"
          ? ["url.dll,FileProtocolHandler", url]
          : [url];
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
        shell: false,
      });
      child.on("error", () =>
        console.log("  Open the URL above in your browser."),
      );
      child.on("exit", (code) => {
        if (code) console.log("  Open the URL above in your browser.");
      });
      child.unref();
    }
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.once(signal, () => {
        server.close();
        server.closeAllConnections();
      });
  }
} catch (error) {
  console.error(
    `\n  ${errorCode(error) === "EADDRINUSE" ? "Port is in use (default: 4242). Close the other instance or choose --port <number>. Whiteboards are stored separately for each browser and port." : error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
