import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { scanProject } from "../src/scanner.js";

test("discovers skills and context with a custom CODEX_HOME", async (t) => {
  const { home, write, scan } = await fixture(t);
  const custom = path.join(home, "custom-codex");
  await write(
    path.join(custom, "skills/review/SKILL.md"),
    "---\nname: review\ndescription: Review code\n---\nReview",
  );
  await write(path.join(custom, "AGENTS.md"), "# User instructions");
  await write(
    path.join(custom, "config.toml"),
    '[mcp_servers.docs]\nurl = "https://example.com/mcp"',
  );
  const { data } = await scan({ codexHome: custom });
  assert.deepEqual(data.skills[0].clients, ["codex"]);
  assert.equal(data.nodes[0].scope, "user");
  assert.equal(data.mcp[0].scope, "user");
});

test("counts visible lines in context files", async (t) => {
  const { root, write, scan } = await fixture(t);
  await write(path.join(root, "CLAUDE.md"), "one\r\ntwo\r\n");
  await write(path.join(root, "nested/AGENTS.md"), "single line");
  await write(path.join(root, "empty/AGENTS.md"), "");
  const { data } = await scan();
  assert.equal(data.nodes.find((node) => node.name === "CLAUDE.md").lines, 2);
  assert.equal(
    data.nodes.find((node) => node.path === "nested/AGENTS.md").lines,
    1,
  );
  assert.equal(
    data.nodes.find((node) => node.path === "empty/AGENTS.md").lines,
    0,
  );
});

async function fixture(t) {
  await fs.mkdir(".local/test", { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".local/test/scanner-"));
  const root = path.join(base, "project");
  const home = path.join(base, "home");
  await fs.mkdir(root);
  await fs.mkdir(home);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const write = async (file, text) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  const scan = (options) =>
    scanProject(root, {
      home,
      codexHome: path.join(home, ".codex"),
      ...options,
    });
  return { root, home, write, scan };
}

test("follows markdown, wikilinks, root-relative references, symlinks and nested context without collecting unrelated prose", async (t) => {
  const { root, write, scan } = await fixture(t);
  await write(
    path.join(root, "CLAUDE.md"),
    "# Root\n[Guide](docs/guide.md) [[Architecture]] `docs/extra.md`",
  );
  await fs.symlink("CLAUDE.md", path.join(root, "AGENTS.md"));
  await write(path.join(root, "docs/guide.md"), "[More](../notes/detail.md)");
  await write(path.join(root, "docs/extra.md"), "Extra");
  await write(
    path.join(root, ".agents/knowledge/Architecture.md"),
    "[[detail]]",
  );
  await write(path.join(root, "notes/detail.md"), "Detail");
  await write(path.join(root, "notes/unrelated.md"), "Not agent context");
  await write(path.join(root, "app/AGENTS.md"), "Nested");
  await write(
    path.join(root, "node_modules/pkg/AGENTS.md"),
    "Ignore dependency",
  );
  const { data } = await scan();
  assert.equal(data.nodes.length, 6);
  assert.equal(
    data.nodes.find((n) => n.name === "AGENTS.md" || n.name === "CLAUDE.md")
      .aliases.length,
    2,
  );
  assert.equal(data.edges.filter((e) => e.kind === "scope").length, 1);
  assert.equal(data.edges.filter((e) => e.kind === "reference").length, 5);
  assert.ok(!JSON.stringify(data).includes("unrelated.md"));
});

test("separates user assets, groups identical copies and preserves client-specific invocation", async (t) => {
  const { root, home, write, scan } = await fixture(t);
  const body =
    "---\nname: deploy\ndescription: Deploy the application\ndisable-model-invocation: true\n---\nInstructions";
  await write(path.join(root, ".agents/skills/deploy/SKILL.md"), body);
  await write(
    path.join(root, ".agents/skills/deploy/agents/openai.yaml"),
    "policy:\n  allow_implicit_invocation: false",
  );
  await write(path.join(root, ".claude/skills/deploy/SKILL.md"), body);
  await write(path.join(home, ".cursor/skills/deploy/SKILL.md"), body);
  const { data } = await scan();
  assert.equal(data.skills.length, 2);
  const skill = data.skills.find((s) => s.scope === "project");
  assert.deepEqual(
    new Set(skill.clients),
    new Set(["cursor", "codex", "claude"]),
  );
  assert.equal(skill.invocation.codex, "User only");
  assert.equal(skill.invocation.claude, "User only");
  assert.equal(skill.paths.length, 2);
  assert.equal((await scan({ includeUser: false })).data.skills.length, 1);
});

test("follows a skill directory symlink without loops or duplicate rows", async (t) => {
  const { root, write, scan } = await fixture(t);
  await write(
    path.join(root, ".claude/skills/review/SKILL.md"),
    "---\nname: review\ndescription: Review code\n---\nReview",
  );
  await fs.mkdir(path.join(root, ".agents"));
  await fs.symlink("../.claude/skills", path.join(root, ".agents/skills"));
  await fs.symlink(root, path.join(root, "loop"));
  const { data } = await scan();
  assert.equal(data.skills.length, 1);
  assert.deepEqual(
    new Set(data.skills[0].clients),
    new Set(["cursor", "codex", "claude"]),
  );
});

test("does not read external symlinks or follow remote links", async (t) => {
  const { root, home, write, scan } = await fixture(t);
  await write(path.join(home, "secret.md"), "OUTSIDE_SECRET");
  await fs.symlink(path.join(home, "secret.md"), path.join(root, "CLAUDE.md"));
  await write(
    path.join(root, "AGENTS.md"),
    "[Outside](../home/secret.md) [Remote](https://example.com/instructions.md)",
  );
  const { data, content } = await scan();
  assert.equal(data.nodes.length, 1);
  assert.ok(
    ![...content.values()].some((text) => text.includes("OUTSIDE_SECRET")),
  );
});

test("parses JSONC and TOML MCP configs while never exposing secrets or claiming connectivity", async (t) => {
  const { root, home, write, scan } = await fixture(t);
  await write(
    path.join(root, ".cursor/mcp.json"),
    '{//comment\n"mcpServers":{"remote":{"url":"https://secret.example?token=SECRET","headers":{"Authorization":"SECRET"}},},}',
  );
  await write(
    path.join(root, ".codex/config.toml"),
    '[mcp_servers.docs]\ncommand = "npx"\nargs = ["SECRET"]\nenabled = false\n[mcp_servers.docs.env]\nTOKEN = "SECRET"',
  );
  await write(
    path.join(root, "app/.mcp.json"),
    '{"mcpServers":{"nested":{"command":"node"}}}',
  );
  await write(
    path.join(home, ".claude.json"),
    JSON.stringify({
      mcpServers: { global: { command: "node" } },
      projects: {
        [root]: { mcpServers: { local: { url: "https://private.example" } } },
        "/other": { mcpServers: { other: {} } },
      },
    }),
  );
  const { data, content } = await scan();
  assert.equal(data.mcp.length, 5);
  assert.equal(data.mcp.find((m) => m.name === "docs").status, "Disabled");
  assert.equal(
    data.mcp.find((m) => m.name === "remote").status,
    "Not verified",
  );
  assert.equal(data.mcp.find((m) => m.name === "local").scope, "project");
  assert.equal(data.mcp.find((m) => m.name === "global").scope, "user");
  assert.ok(!JSON.stringify(data).includes("SECRET"));
  assert.equal(content.size, 0);
});

test("reports malformed configs and keeps valid context available", async (t) => {
  const { root, write, scan } = await fixture(t);
  await write(path.join(root, ".mcp.json"), "{broken");
  await write(path.join(root, "AGENTS.md"), "Valid");
  const { data } = await scan();
  assert.equal(data.nodes.length, 1);
  assert.equal(data.warnings.length, 1);
});

test("does not guess ambiguous wikilinks", async (t) => {
  const { root, write, scan } = await fixture(t);
  await write(path.join(root, "AGENTS.md"), "[[Note]]");
  await write(path.join(root, "a/Note.md"), "A");
  await write(path.join(root, "b/Note.md"), "B");
  assert.equal((await scan()).data.edges.length, 0);
});
