import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { scanProject } from "../src/scanner.js";
import { startServer } from "../src/server.js";

test("separates dedicated rules from context and exposes rule metadata", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".local/test/rules-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "project");
  const home = path.join(base, "home");
  await fs.mkdir(root);
  await fs.mkdir(home);
  const write = async (file, text) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  await write(
    path.join(root, "AGENTS.md"),
    "# Codex\n[Rule](.cursor/rules/api.mdc)",
  );
  await write(path.join(root, "CLAUDE.md"), "# Claude");
  await write(path.join(root, ".cursorrules"), "Legacy Cursor guidance");
  await write(
    path.join(root, ".cursor/rules/api.mdc"),
    '---\ndescription: API conventions\nglobs: "src/**/*.ts"\nalwaysApply: false\n---\n[Guide](../../docs/rule-only.md)',
  );
  await write(path.join(root, "docs/rule-only.md"), "Rule-only reference");
  await write(
    path.join(root, "app/.claude/rules/testing.md"),
    '---\npaths:\n  - "test/**/*.js"\n---\nUse node:test',
  );
  await write(path.join(home, ".claude/rules/preferences.md"), "Personal rule");
  await write(path.join(root, ".codex/rules/default.rules"), "prefix_rule()");
  await write(path.join(root, ".agents/rules/notes.md"), "Generic context");
  const { data, content } = await scanProject(root, { home });
  assert.deepEqual(
    new Set(data.rules.map((rule) => rule.name)),
    new Set([".cursorrules", "api.mdc", "testing.md", "preferences.md"]),
  );
  assert.deepEqual(data.rules.find((rule) => rule.name === "api.mdc").globs, [
    "src/**/*.ts",
  ]);
  assert.deepEqual(
    data.rules.find((rule) => rule.name === "testing.md").pathsCondition,
    ["test/**/*.js"],
  );
  assert.equal(
    data.rules.find((rule) => rule.name === "preferences.md").scope,
    "user",
  );
  assert.deepEqual(
    data.rules.find((rule) => rule.name === ".cursorrules").clients,
    ["cursor"],
  );
  assert.ok(data.nodes.some((node) => node.name === "AGENTS.md"));
  assert.ok(data.nodes.some((node) => node.name === "CLAUDE.md"));
  assert.ok(data.nodes.some((node) => node.name === "notes.md"));
  assert.ok(
    !data.nodes.some((node) =>
      [".cursorrules", "api.mdc", "testing.md", "rule-only.md"].includes(
        node.name,
      ),
    ),
  );
  assert.ok(!JSON.stringify(data).includes("default.rules"));
  assert.equal(
    content
      .get(data.rules.find((rule) => rule.name === "api.mdc").id)
      .includes("rule-only.md"),
    true,
  );

  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const baseUrl = url.split("#")[0];
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(baseUrl + "api/scan", { headers });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.rules.length, 3);
  const preview = await fetch(
    baseUrl +
      "api/content?id=" +
      snapshot.rules.find((rule) => rule.name === "api.mdc").id,
    { headers },
  );
  assert.equal(preview.status, 200);
  assert.match((await preview.json()).text, /API conventions/);
});

test("groups symlinked rule paths by file and preserves each client", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".local/test/rules-links-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "project");
  const home = path.join(base, "home");
  await fs.mkdir(path.join(root, ".cursor/rules"), { recursive: true });
  await fs.mkdir(path.join(root, ".claude/rules"), { recursive: true });
  await fs.mkdir(home);
  await fs.writeFile(path.join(root, ".cursor/rules/shared.md"), "Shared rule");
  await fs.symlink(
    "../../.cursor/rules/shared.md",
    path.join(root, ".claude/rules/shared.md"),
  );
  const { data } = await scanProject(root, { home, includeUser: false });
  assert.equal(data.rules.length, 1);
  assert.equal(data.rules[0].paths.length, 2);
  assert.deepEqual(
    new Set(data.rules[0].clients),
    new Set(["cursor", "claude"]),
  );
  assert.equal(data.nodes.length, 0);
});
