#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { startServer } from "./server.js";

const help = `Agent Visualizer · Boyscout

Usage: npx @codeursenior/boyscout ui [folder] [options]

Explore context, skills and MCP configuration in your default browser.

  --port <number>   Choose a port (default: an available port)
  --no-open         Print the URL without opening a browser
  --project-only    Skip user-level assets
  --help, -h        Show this help

Local workspace. No telemetry. Ctrl+C to stop.
`;

try {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: "string" },
      "no-open": { type: "boolean" },
      "project-only": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help || !positionals.length) {
    console.log(help);
  } else {
    if (positionals[0] !== "ui" || positionals.length > 2)
      throw new Error(
        "Expected: boyscout ui [folder]. Use --help for options.",
      );
    const port = values.port === undefined ? 0 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Port must be an integer between 0 and 65535.");
    const root = path.resolve(positionals[1] || process.cwd());
    console.log(`\n  Agent Visualizer\n  Scanning ${root} ...`);
    const { server, url } = await startServer({
      root,
      port,
      includeUser: !values["project-only"],
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
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        server.close();
        server.closeAllConnections();
      });
  }
} catch (error) {
  console.error(
    `\n  ${error.code === "EADDRINUSE" ? "Port is in use. Choose another --port or omit it." : error.message}\n`,
  );
  process.exitCode = 1;
}
