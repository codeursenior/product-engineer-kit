import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { startServer } from "../src/server.js";

test("serves the packaged UI and authenticated read-only APIs without cross-origin or arbitrary-file access", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/server-"));
  await fs.writeFile(
    path.join(root, "AGENTS.md"),
    "# Context\n<script>alert(1)</script>",
  );
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = url.split("#")[0];
  const headers = { Authorization: `Bearer ${token}` };
  const ui = await fetch(base);
  assert.equal(ui.status, 200);
  assert.ok(
    ui.headers
      .get("content-security-policy")
      .includes("frame-ancestors 'none'"),
  );
  const html = await ui.text();
  assert.match(html, /Agent Visualizer/);
  assert.match(html, /Project \(shared with your team\)/);
  assert.match(html, /On Your Machine \(not shared with your\s+team\)/);
  assert.doesNotMatch(html, /Stays on your machine/);
  assert.doesNotMatch(html, /class="breadcrumb"/);
  const sidebarNote = html.indexOf('class="sidebar-note"');
  const refresh = html.indexOf('id="refresh"');
  const sidebarFooter = html.indexOf('class="sidebar-footer"');
  assert.ok(sidebarNote < refresh && refresh < sidebarFooter);
  assert.equal((await fetch(base + "api/scan")).status, 401);
  assert.equal(
    (
      await fetch(base + "api/scan", {
        headers: { ...headers, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const wrongHost = await new Promise((resolve) => {
    http.get(base, { headers: { Host: "evil.example" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
  });
  assert.equal(wrongHost, 403);
  assert.equal(
    (await fetch(base + "api/scan", { method: "POST", headers })).status,
    405,
  );
  const data = await (await fetch(base + "api/scan", { headers })).json();
  assert.equal(data.nodes.length, 1);
  const content = await (
    await fetch(base + "api/content?id=" + data.nodes[0].id, { headers })
  ).json();
  assert.match(content.text, /<script>/);
  assert.equal(
    (await fetch(base + "api/content?id=../../etc/passwd", { headers })).status,
    404,
  );
  assert.equal((await fetch(base + "src/scanner.js")).status, 404);
  await fs.writeFile(path.join(root, "CLAUDE.md"), "# New file");
  const refreshed = await (
    await fetch(base + "api/scan?refresh=1", { headers })
  ).json();
  assert.equal(refreshed.nodes.length, 2);
});
