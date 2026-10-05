import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { test } from "vitest";
import type { FileResponse, ScanData } from "../src/contracts.js";
import { required } from "../src/scan/values.js";
import { startServer } from "../src/server.js";
test("serves the packaged UI and authenticated APIs without cross-origin or arbitrary-file access", async (t) => {
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
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = required(url.split("#")[0]);
  const headers = { Authorization: `Bearer ${token}` };
  const ui = await fetch(base);
  assert.equal(ui.status, 200);
  assert.ok(
    required(ui.headers.get("content-security-policy")).includes(
      "frame-ancestors 'none'",
    ),
  );
  const html = await ui.text();
  assert.match(html, /Agent Visualizer/);
  assert.match(html, /app-root/);
  const script = required(required(html.match(/src="([^"]+\.js)"/)?.[1]));
  assert.equal((await fetch(base + script)).status, 200);
  const image = await fetch(base + "mountain-context.jpg");
  assert.equal(image.status, 200);
  assert.equal(required(image.headers.get("content-type")), "image/jpeg");
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
    required(
      http.get(base, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }),
    );
  });
  assert.equal(wrongHost, 403);
  assert.equal(
    (await fetch(base + "api/scan", { method: "POST", headers })).status,
    405,
  );
  const data: ScanData = await (
    await fetch(base + "api/scan", { headers })
  ).json();
  assert.equal(data.nodes.length, 1);
  const content = await (
    await fetch(base + "api/content?id=" + required(data.nodes[0]).id, {
      headers,
    })
  ).json();
  assert.match(content.text, /<script>/);
  assert.equal(
    (await fetch(base + "api/content?id=../../etc/passwd", { headers })).status,
    404,
  );
  assert.equal((await fetch(base + "src/scanner.js")).status, 404);
  for (const [name, type] of [
    ["cursor.png", "image/png"],
    ["claude.png", "image/png"],
    ["chatgpt.webp", "image/webp"],
    ["copilot.svg", "image/svg+xml"],
  ]) {
    const response = await fetch(base + `client-logos/${name}`);
    assert.equal(response.status, 200);
    assert.equal(required(response.headers.get("content-type")), type);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await fs.readFile(
        new URL(`../public/client-logos/${name}`, import.meta.url),
      ),
    );
  }
  await fs.writeFile(path.join(root, "CLAUDE.md"), "# New file");
  const refreshed = await (
    await fetch(base + "api/scan?refresh=1", { headers })
  ).json();
  assert.equal(refreshed.nodes.length, 2);
});
test("edits indexed context and skill files without overwriting newer changes", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/edit-"));
  const context = path.join(root, "AGENTS.md");
  const skill = path.join(root, ".claude/skills/example/SKILL.md");
  await fs.mkdir(path.dirname(skill), { recursive: true });
  await fs.writeFile(context, "# Original context\n");
  await fs.writeFile(skill, "---\nname: example\n---\nOriginal skill\n");
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = required(url.split("#")[0]);
  const headers = { Authorization: `Bearer ${token}` };
  const data: ScanData = await (
    await fetch(base + "api/scan", { headers })
  ).json();
  const contextId = required(required(data.nodes[0]).editTargets[0]).id;
  const skillId = required(required(data.skills[0]).editTargets[0]).id;
  const fileUrl = (id: string) => base + `api/file?id=${id}`;
  const put = (
    id: string,
    text: string,
    revision: string,
    extraHeaders: Record<string, string> = {},
  ) =>
    fetch(fileUrl(id), {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({ text, revision }),
    });
  const initial: FileResponse = await (
    await fetch(fileUrl(contextId), { headers })
  ).json();
  assert.equal(initial.text, "# Original context\n");
  assert.equal(
    (
      await put(contextId, "blocked", initial.revision, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await put("../../AGENTS.md", "blocked", initial.revision)).status,
    404,
  );
  assert.equal(
    (await put(contextId, "# Updated context\n", initial.revision)).status,
    200,
  );
  assert.equal(await fs.readFile(context, "utf8"), "# Updated context\n");
  assert.equal((await put(contextId, "stale", initial.revision)).status, 409);
  const skillInitial: FileResponse = await (
    await fetch(fileUrl(skillId), { headers })
  ).json();
  await fs.writeFile(skill, "Changed elsewhere\n");
  assert.equal(
    (await put(skillId, "stale", skillInitial.revision)).status,
    409,
  );
  assert.equal(await fs.readFile(skill, "utf8"), "Changed elsewhere\n");
  const current: FileResponse = await (
    await fetch(fileUrl(skillId), { headers })
  ).json();
  assert.equal(
    (await put(skillId, "Updated skill\n", current.revision)).status,
    200,
  );
  assert.equal(await fs.readFile(skill, "utf8"), "Updated skill\n");
});
test("deletes only indexed, unchanged files with a single real path", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/delete-"));
  const context = path.join(root, "AGENTS.md");
  const linked = path.join(root, "CLAUDE.md");
  const linkTarget = path.join(root, "link-target.txt");
  const linkedOnly = path.join(root, "GEMINI.md");
  await fs.writeFile(context, "# Original\n");
  await fs.symlink("AGENTS.md", linked);
  await fs.writeFile(linkTarget, "# Linked only\n");
  await fs.symlink("link-target.txt", linkedOnly);
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = required(url.split("#")[0]);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const fileUrl = (id: string) =>
    base + `api/file?id=${encodeURIComponent(id)}`;
  const remove = (
    id: string,
    revision: string,
    extraHeaders: Record<string, string> = {},
  ) =>
    fetch(fileUrl(id), {
      method: "DELETE",
      headers: { ...headers, ...extraHeaders },
      body: JSON.stringify({ revision }),
    });
  const scan: ScanData = await (
    await fetch(base + "api/scan", { headers })
  ).json();
  const target = required(
    required(scan.nodes.find((node) => node.path === "AGENTS.md"))
      .editTargets[0],
  );
  assert.equal(target.deletable, false);
  const initial: FileResponse = await (
    await fetch(fileUrl(target.id), { headers })
  ).json();
  assert.equal((await remove(target.id, initial.revision)).status, 409);
  assert.equal(await fs.readFile(context, "utf8"), "# Original\n");
  const symlinkTarget = required(
    required(scan.nodes.find((node) => node.path === "GEMINI.md"))
      .editTargets[0],
  );
  assert.equal(symlinkTarget.deletable, false);
  const linkedInitial: FileResponse = await (
    await fetch(fileUrl(symlinkTarget.id), { headers })
  ).json();
  assert.equal(
    (await remove(symlinkTarget.id, linkedInitial.revision)).status,
    409,
  );
  assert.equal(await fs.readFile(linkTarget, "utf8"), "# Linked only\n");
  await fs.unlink(linked);
  const rescanned: ScanData = await (
    await fetch(base + "api/scan?refresh=1", { headers })
  ).json();
  const refreshedTarget = required(
    required(rescanned.nodes.find((node) => node.path === "AGENTS.md"))
      .editTargets[0],
  );
  const id = refreshedTarget.id;
  assert.equal(refreshedTarget.deletable, true);
  assert.equal(
    (await remove(id, initial.revision, { Origin: "https://evil.example" }))
      .status,
    403,
  );
  assert.equal((await remove("../../AGENTS.md", initial.revision)).status, 404);
  assert.equal(
    (
      await fetch(fileUrl(id), {
        method: "DELETE",
        body: JSON.stringify({ revision: initial.revision }),
      })
    ).status,
    401,
  );
  await fs.writeFile(context, "# Changed\n");
  assert.equal((await remove(id, initial.revision)).status, 409);
  assert.equal(await fs.readFile(context, "utf8"), "# Changed\n");
  const current: FileResponse = await (
    await fetch(fileUrl(id), { headers })
  ).json();
  assert.equal((await remove(id, current.revision)).status, 200);
  await assert.rejects(fs.stat(context), { code: "ENOENT" });
  const after: ScanData = await (
    await fetch(base + "api/scan?refresh=1", { headers })
  ).json();
  assert.ok(after.nodes.every((node) => node.path !== "AGENTS.md"));
});
