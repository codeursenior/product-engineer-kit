import fs from "node:fs/promises";
import path from "node:path";
// Exercise the built server with the same type contract as its source.
import type * as Server from "../../src/server.js";
const { startServer }: typeof Server = await import(
  new URL("../../dist/server.js", import.meta.url).href
);

const base = path.resolve(".local/browser");
const root = path.join(base, "project");
const home = path.join(base, "home");
await fs.mkdir(base, { recursive: true });
// Only this synthetic fixture directory is ever reset.
await fs.rm(root, { recursive: true, force: true });
await fs.rm(home, { recursive: true, force: true });
const files: Record<string, string> = {
  "project/AGENTS.md":
    "# Project guidance\n[Architecture](docs/architecture.md)\n",
  "project/docs/architecture.md":
    '# Architecture\nKeep modules focused.\n<script>alert("data only")</script>',
  "project/app/CLAUDE.md": "# Application guidance\n",
  "project/.cursor/rules/testing.mdc":
    '---\ndescription: Testing conventions\nglobs: "src/**/*.ts"\nalwaysApply: false\n---\nTest behavior.',
  "project/.claude/rules/style.md":
    '---\npaths:\n  - "src/**/*.ts"\n---\nKeep code readable.',
  "project/.agents/skills/review/SKILL.md":
    "---\nname: review\ndescription: Review changes\ndisable-model-invocation: true\n---\nReview behavior and tests.",
  "project/.claude/skills/review/SKILL.md":
    "---\nname: review\ndescription: Review changes\ndisable-model-invocation: true\n---\nReview behavior and tests.",
  "project/.cursor/mcp.json":
    '{"mcpServers":{"docs":{"url":"https://example.invalid/SECRET","headers":{"Authorization":"SECRET"}}}}',
  "home/.codex/AGENTS.md": "# Personal guidance\n",
};
for (const [relative, text] of Object.entries(files)) {
  const file = path.join(base, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}
const session = await startServer({
  root,
  home,
  codexHome: path.join(home, ".codex"),
  port: 43917,
});
await fs.writeFile(
  path.join(base, "session.json"),
  JSON.stringify({ url: session.url, root, home }),
);
console.log("Browser fixture ready");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    session.server.closeAllConnections();
    session.server.close();
  });
}
