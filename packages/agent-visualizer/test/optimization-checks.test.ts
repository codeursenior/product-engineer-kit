import fs from "node:fs/promises";
import path from "node:path";
import { expect, test, vi } from "vitest";
import type { OptimizationChecks } from "../src/contracts.js";
import { startServer } from "../src/server.js";
const command = vi.hoisted(() => ({
  version: "rtk 1.0.0",
  help: "Rust Type Kit",
  error: false,
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    callback(
      command.error ? new Error("missing") : null,
      args[0] === "--version" ? command.version : command.help,
    );
  },
}));
test("checks Rust Token Killer identity again instead of trusting a shared executable name", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/checks-"));
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const endpoint = new URL("/api/optimization-checks", url);
  expect((await fetch(endpoint)).status).toBe(401);
  const check = async (): Promise<OptimizationChecks> => {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  expect((await check()).checks[0]).toMatchObject({
    id: "rtk",
    detected: false,
  });
  command.help = "Rust Token Killer - Minimize LLM token consumption";
  expect((await check()).checks[0]).toMatchObject({
    id: "rtk",
    detected: true,
  });
  command.error = true;
  expect((await check()).checks[0]).toMatchObject({
    id: "rtk",
    detected: false,
  });
});
