import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("uses port 4242 by default and explains collisions without changing ports", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/cli-"));
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const run = () =>
    spawn(
      process.execPath,
      [cli, "audit", "agent", root, "--project-only", "--no-open"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
  const first = run();
  t.onTestFinished(async () => {
    if (first.exitCode === null && first.signalCode === null) {
      const exited = once(first, "exit");
      first.kill();
      await exited;
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const startup = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("CLI startup timed out")),
      10000,
    );
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (
        output.includes("http://127.0.0.1:") ||
        output.includes("Port is in use")
      ) {
        clearTimeout(timer);
        resolve(output);
      }
    };
    first.stdout.on("data", collect);
    first.stderr.on("data", collect);
    first.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    first.once("exit", () => {
      clearTimeout(timer);
      resolve(output);
    });
  });
  if (startup.includes("Port is in use")) {
    t.skip("Another application already owns port 4242");
    return;
  }
  expect(startup).toContain("http://127.0.0.1:4242/");
  const second = run();
  let error = "";
  second.stderr.on("data", (chunk: Buffer) => {
    error += chunk.toString();
  });
  const [code] = await once(second, "exit");
  expect(code).toBe(1);
  expect(error).toContain("Port is in use");
  expect(error).toContain("--port <number>");
  expect(error).toContain("stored separately");
}, 20000);
