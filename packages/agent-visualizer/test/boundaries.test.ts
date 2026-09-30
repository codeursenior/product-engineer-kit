import fs from "node:fs/promises";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { FileResponse, ScanData } from "../src/contracts.js";
import { required } from "../src/scan/values.js";
import * as scanner from "../src/scanner.js";
import { startServer } from "../src/server.js";

it("warns about oversized documents/configs and depth limits while retaining valid files", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/limits-"));
  t.onTestFinished(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "AGENTS.md"), "# Valid");
  await fs.writeFile(path.join(root, "CLAUDE.md"), "x".repeat(512 * 1024 + 1));
  await fs.writeFile(
    path.join(root, ".mcp.json"),
    " ".repeat(2 * 1024 * 1024 + 1),
  );
  const deep = path.join(root, ...Array<string>(36).fill("a"));
  await fs.mkdir(deep, { recursive: true });
  await fs.writeFile(path.join(deep, "AGENTS.md"), "# Too deep");
  const { data } = await scanner.scanProject(root, { includeUser: false });
  expect(data.nodes.map((node) => node.path)).toEqual(["AGENTS.md"]);
  expect(data.limits.truncated).toBe(true);
  expect(data.warnings.join(" ")).toContain("Skipped large context file");
  expect(data.warnings.join(" ")).toContain("Skipped oversized config");
  expect(data.warnings.join(" ")).toContain("35 folder levels");
});

it("coalesces refreshes, rejects invalid edits, serializes writes, and serves only built assets", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/http-"));
  await fs.writeFile(path.join(root, "AGENTS.md"), "# Initial");
  const initial = await scanner.scanProject(root, { includeUser: false });
  const scan = vi.spyOn(scanner, "scanProject").mockResolvedValueOnce(initial);
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.onTestFinished(async () => {
    scan.mockRestore();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = required(url.split("#")[0]);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const first = await fetch(base),
    second = await fetch(base);
  const html = await first.text();
  const nonce = required(html.match(/ngcspnonce="([^"]+)"/i)?.[1]);
  expect(first.headers.get("Content-Security-Policy")).toContain(
    `'nonce-${nonce}'`,
  );
  expect(second.headers.get("Content-Security-Policy")).not.toBe(
    first.headers.get("Content-Security-Policy"),
  );
  expect(html).not.toContain("__CSP_NONCE__");
  for (const route of [
    "src/scanner.ts",
    "dist/cli.js",
    "package.json",
    "main.js.map",
    "%2e%2e/package.json",
  ])
    expect((await fetch(base + route)).status).toBe(404);
  const id = required(initial.data.nodes[0]).id;
  const endpoint = `${base}api/file?id=${id}`;
  expect(
    (await fetch(endpoint, { method: "PUT", headers, body: "{broken" })).status,
  ).toBe(400);
  expect(
    (await fetch(endpoint, { method: "PUT", headers, body: "{}" })).status,
  ).toBe(400);
  expect(
    (
      await fetch(endpoint, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: "{}",
      })
    ).status,
  ).toBe(415);
  const file: FileResponse = await (await fetch(endpoint, { headers })).json();
  expect(
    (
      await fetch(endpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          text: "x".repeat(512 * 1024 + 1),
          revision: file.revision,
        }),
      })
    ).status,
  ).toBe(413);
  const saves = await Promise.all(
    ["first", "second"].map((text) =>
      fetch(endpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ text, revision: file.revision }),
      }),
    ),
  );
  expect(saves.map((response) => response.status).sort()).toEqual([200, 409]);
  let resolve: (result: typeof initial) => void = () => {
    throw new Error("Scan not started");
  };
  scan.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let refreshRequests = 0;
  server.on("request", (req) => {
    if (req.url?.includes("refresh=1")) refreshRequests++;
  });
  const refreshes = [
    fetch(base + "api/scan?refresh=1", { headers }),
    fetch(base + "api/scan?refresh=1", { headers }),
  ];
  await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(refreshRequests).toBe(2));
  resolve(initial);
  const results: ScanData[] = await Promise.all(
    refreshes.map(async (response) => (await response).json()),
  );
  expect(results).toEqual([initial.data, initial.data]);
  expect(scan).toHaveBeenCalledTimes(2);
});
