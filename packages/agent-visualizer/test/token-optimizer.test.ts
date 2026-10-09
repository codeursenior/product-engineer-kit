import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import type { TokenEstimate } from "../src/contracts.js";
import { startServer } from "../src/server.js";

test("estimates one agent's startup and on-demand context through the authenticated API", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/optimizer-"));
  for (const [name, text] of Object.entries({
    "AGENTS.md": "Read [guide](guide.md)",
    "guide.md": "abcdefgh",
    "child/AGENTS.md": "Nested context",
    "CLAUDE.md": "Claude only",
    ".agents/skills/test/SKILL.md":
      "---\nname: test\ndescription: Run tests\n---\nSkill body",
  })) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), text);
  }
  const { server, url, token } = await startServer({
    root,
    includeUser: false,
  });
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  });
  const endpoint = new URL(
    "/api/token-estimate?client=codex&model=gpt-5.3-codex",
    url,
  );
  expect((await fetch(endpoint)).status).toBe(401);
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  const data: TokenEstimate = await response.json();
  expect(
    data.entries.map((entry) => [entry.path, entry.portion, entry.kind]),
  ).toEqual(
    expect.arrayContaining([
      ["AGENTS.md", "startup", "instruction"],
      ["guide.md", "on-demand", "document"],
      ["child/AGENTS.md", "on-demand", "instruction"],
      [".agents/skills/test/SKILL.md", "startup", "skill-catalog"],
      [".agents/skills/test/SKILL.md", "on-demand", "skill-body"],
    ]),
  );
  expect(data.entries).toHaveLength(5);
  expect(data.entries.find((entry) => entry.path === "guide.md")).toMatchObject(
    { tokens: 2, words: 1, bytes: 8, inputCost: 0.0000035 },
  );
  expect(data.startup).toMatchObject({ tokens: 10, words: 5, bytes: 36 });
  expect(data.onDemand).toMatchObject({ tokens: 9, words: 5, bytes: 32 });
  expect(data.entries.map((entry) => entry.tokens)).toEqual([6, 4, 4, 3, 2]);
  endpoint.searchParams.set("client", "all");
  expect(
    (await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } }))
      .status,
  ).toBe(400);
});

test("keeps user context, conditional rules and duplicate skills scoped to the selected agent", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const base = await fs.mkdtemp(path.resolve(".local/test/scope-"));
  const root = path.join(base, "project"),
    home = path.join(base, "home");
  const duplicate =
    "---\nname: shared\ndescription: Shared workflow\n---\nSee [notes](notes.md)";
  for (const [name, text] of Object.entries({
    "project/AGENTS.md": "Fallback instructions",
    "project/AGENTS.override.md": "Override instructions",
    "project/.claude/CLAUDE.md": "Claude project instructions [[Guidelines]]",
    "project/docs/guidelines.md": "Shared guidelines",
    "project/.claude/rules/global.md": "Global rule",
    "project/.claude/rules/conditional.md":
      "---\npaths: [src/**]\n---\nScoped rule",
    "project/.cursor/rules/always.mdc":
      "---\nalwaysApply: true\n---\nAlways rule",
    "project/.cursor/rules/optional.mdc":
      "---\nglobs: ['*.ts']\n---\nOptional rule",
    "project/.github/copilot-instructions.md": "Copilot instructions",
    "project/.agents/skills/shared/SKILL.md": duplicate,
    "project/.claude/skills/shared/SKILL.md": duplicate,
    "project/.claude/skills/shared/notes.md": "Linked notes",
    "home/.codex/AGENTS.md": "User Codex instructions",
    "home/.claude/CLAUDE.md": "User Claude instructions",
  })) {
    const file = path.join(base, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  }
  const { server, url, token } = await startServer({
    root,
    home,
    codexHome: path.join(home, ".codex"),
  });
  t.onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(base, { recursive: true, force: true });
  });
  const get = async (
    client: string,
    model = "claude-sonnet-5.5",
  ): Promise<TokenEstimate> =>
    (
      await fetch(
        new URL(`/api/token-estimate?client=${client}&model=${model}`, url),
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json();
  const codex = await get("codex");
  expect(
    codex.entries
      .filter((entry) => entry.kind === "instruction")
      .map((entry) => entry.name),
  ).toEqual(expect.arrayContaining(["AGENTS.override.md", "AGENTS.md"]));
  expect(codex.entries.some((entry) => entry.path === "AGENTS.md")).toBe(false);
  expect(codex.entries.filter((entry) => entry.scope === "user")).toHaveLength(
    1,
  );
  const claude = await get("claude");
  expect(
    claude.entries.find((entry) => entry.name === "guidelines.md")?.portion,
  ).toBe("on-demand");
  expect(
    claude.entries.filter((entry) => entry.kind === "skill-catalog"),
  ).toHaveLength(1);
  expect(
    claude.entries.find((entry) => entry.kind === "skill-catalog")?.portion,
  ).toBe("startup");
  expect(
    claude.entries.find((entry) => entry.name === "global.md")?.portion,
  ).toBe("startup");
  expect(
    claude.entries.find((entry) => entry.name === "conditional.md")?.portion,
  ).toBe("on-demand");
  expect(
    claude.entries.find((entry) => entry.name === "notes.md")?.portion,
  ).toBe("on-demand");
  expect(claude.entries.filter((entry) => entry.scope === "user")).toHaveLength(
    1,
  );
  const cursor = await get("cursor");
  expect(
    cursor.entries.find((entry) => entry.name === "always.mdc")?.portion,
  ).toBe("startup");
  expect(
    cursor.entries.find((entry) => entry.name === "optional.mdc")?.portion,
  ).toBe("on-demand");
  const copilot = await get("copilot");
  expect(
    copilot.entries.find((entry) => entry.name === "copilot-instructions.md")
      ?.portion,
  ).toBe("startup");
  expect(
    (await get("claude", "claude-opus-5.5")).startup.inputCost,
  ).toBeCloseTo(claude.startup.inputCost * 2);
});

test("counts physical aliases once and promotes a duplicated skill catalog when any copy applies at startup", async (t) => {
  await fs.mkdir(".local/test", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".local/test/dedup-"));
  const skill = "---\nname: shared\ndescription: Workflow\n---\nWork carefully";
  for (const [name, text] of Object.entries({
    "AGENTS.md": "Common instructions",
    ".agents/nested/.agents/skills/shared/SKILL.md": skill,
    ".agents/skills/shared/SKILL.md": skill,
  })) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  }
  await fs.mkdir(path.join(root, ".cursor/rules"), { recursive: true });
  await fs.symlink(
    path.join(root, "AGENTS.md"),
    path.join(root, ".cursor/rules/global.mdc"),
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
  const response = await fetch(
    new URL("/api/token-estimate?client=cursor&model=gpt-5.3-codex", url),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data: TokenEstimate = await response.json();
  expect(
    data.entries.find((entry) => entry.kind === "skill-catalog")?.portion,
  ).toBe("startup");
  expect(
    data.entries.filter((entry) =>
      ["rule", "instruction"].includes(entry.kind),
    ),
  ).toHaveLength(1);
  expect(data.startup.tokens).toBe(9);
  expect(data.onDemand.tokens).toBe(4);
});
