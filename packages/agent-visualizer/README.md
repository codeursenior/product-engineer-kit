# Agent Visualizer

**See the context behind your coding agent.**

Agent Visualizer, distributed as Boyscout, opens a local dashboard for the instructions, knowledge, skills, and MCP configurations inside a folder. Inspired by the clarity of an Obsidian graph, with separate views for project and user assets.

```bash
npx @codeursenior/boyscout ui
```

Requires Node.js 20 or newer. Run the command in the folder you want to explore. Your default browser opens automatically. Press Ctrl+C in the terminal to stop the server.

## Explore

- **Context:** interactive graph with pan, zoom, draggable nodes, and file previews. Solid lines are explicit references; dashed lines show nested instruction scopes. Switch to Files for an accessible table.
- **Rules:** searchable list of dedicated Cursor and Claude Code rule files, with source paths, declared file conditions, client discovery, and previews. Metadata does not prove a rule loaded in a session.
- **Skills:** names, descriptions, invocation policy, source paths, and discovery indicators for Cursor, Claude Code, and Codex. Identical copies in the same scope are grouped, retaining their paths.
- **MCP servers:** names, configuration sources, transport, and client indicators. The tool reads configuration without launching servers or transmitting credentials.
- **Project and User:** green and purple distinguish assets in the selected folder from assets in supported home-directory locations. Scope filters work in all views.

Search with `/`, close the preview with Escape, and use Rescan after changing files.

```bash
npx @codeursenior/boyscout ui /path/to/project
npx @codeursenior/boyscout ui --project-only
npx @codeursenior/boyscout ui --port 4317 --no-open
```

A random available loopback port is used by default. The terminal URL includes a session token. Keep that URL private while the viewer is running.

## What is discovered

| Asset        | Project                                                                                                  | User                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Instructions | `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.local.md`, `GEMINI.md`, including nested folders | `~/.codex/AGENTS.md`, override, `~/.claude/CLAUDE.md`, `~/.cursor/AGENTS.md`                                |
| Rules        | `.cursor/rules/`, `.claude/rules/`, and legacy `.cursorrules`, including nested folders                  | Supported Cursor and Claude Code rule directories                                                           |
| Knowledge    | Markdown under supported agent knowledge folders, other linked local documents                           | Supported agent knowledge directories                                                                       |
| Skills       | `SKILL.md` files; client discovery depends on the containing agent directory                             | `~/.agents/skills`, `~/.claude/skills`, `~/.cursor/skills`, legacy `~/.codex/skills`                        |
| MCP          | `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`, including nested folders      | `~/.cursor/mcp.json`, `~/.codex/config.toml`, global and matching project-local entries in `~/.claude.json` |

`CODEX_HOME` is respected. Markdown links, Obsidian wikilinks, backtick file paths and `@file.md` references connect context nodes. Unrelated Markdown stays out of the graph. Symlinks within the selected folder and supported agent home directories are resolved and deduplicated. External symlinks are excluded.

Codex behavior instructions in `AGENTS.md` stay in Context. Codex `.codex/rules/*.rules` are command approval policies and are not included in Rules. Cursor user rules configured only in application settings cannot be read from the filesystem.

Client icons show **file-based discovery**, not whether an application is installed, whether a skill's dependencies are available, or whether an asset is active in a particular conversation. Nested skills may only load when that client works in their folder. A skill outside recognized directories is listed with inactive client icons.

Claude/Cursor `disable-model-invocation` and Claude `user-invocable` frontmatter are read. Codex `agents/openai.yaml` policy `allow_implicit_invocation` is read separately. Hover an icon or open a skill to inspect per-client invocation. Legacy `.codex/skills` paths are identified in details.

## Honest limits

MCP status is **Not verified** for a configured server, or **Disabled** if its configuration disables it. A config file cannot establish whether another application's live MCP session is connected. Check that client's MCP panel for live status. No MCP commands, probes, hooks, or skill scripts are executed.

This is an inventory of the selected subtree and supported user locations, not a reconstruction of a live agent prompt. It does not yet model parent-folder inheritance above the selected root, managed enterprise rules, remote account assets, plugin caches, client settings overrides, or effective precedence. It does not interpret every Markdown construct; ambiguous wikilinks remain unconnected. Dependency/build folders and arbitrary hidden folders are skipped. Scans are limited to 20,000 files, 35 folder levels and 512 KiB per context document, with warnings when limits are reached. JSON/TOML configs are limited to 2 MiB.

## Privacy

The application binds to `127.0.0.1` only, checks Host and Origin, and requires a random session token for data requests. Everything stays in memory; the scanner does not modify the scanned folder or save inventories. There is no telemetry, CDN, external font, AI API, or network request during scanning. npm may access its registry when installing the tool.

MCP commands, arguments, URLs, environment values, and headers are excluded from the API and UI. Context and skill previews display their actual text locally. Treat the open dashboard like your editor: documents may contain private information.

## Development

```bash
npm ci
npm run check
npm start -- /path/to/project
```

The Node server and scanner use ordinary ES modules. D3 powers the graph; esbuild bundles browser code. The published package contains prebuilt assets, so end users need no build step. Source lives in `src/` and `ui/`; browser assets live in `public/`; integration tests live in `test/`.

See [architecture and discovery notes](docs/architecture.md) and [release instructions](https://github.com/codeursenior/product-engineer-kit/blob/main/docs/releasing.md).

MIT © Simon Dieny. Independent project, not affiliated with Cursor, Anthropic, or OpenAI.
