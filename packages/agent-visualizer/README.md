# Agent Visualizer

**See the context behind your coding agent.**

Agent Visualizer, part of Product Engineer Kit, opens a local dashboard for the instructions, knowledge, and skills inside a folder. Inspired by the clarity of an Obsidian graph, with separate views for project and user assets.

```bash
npx @codeursenior/pek audit agent
```

Requires Node.js 20 or newer. Run the command in the folder you want to explore. Your default browser opens automatically. Press Ctrl+C in the terminal to stop the server.

To check the installed release, run `npx --prefer-online @codeursenior/pek@latest --version`. The `--prefer-online` option asks npm to check the registry even when it has cached package data.

The `audit agent` command inventories local agent configuration and estimates context size. It does not assign a quality score or prove what an agent loaded in a live session.

## Migrating from Boyscout

Replace `npx @codeursenior/boyscout ui [folder]` with `npx @codeursenior/pek audit agent [folder]`. The folder and options stay the same. All published Boyscout versions are deprecated with a migration message pointing to PEK. Deprecation leaves the old command usable; use PEK for new installations and updates. Already installed or cached copies may continue to run even after the package is removed from npm.

## Explore

Token Optimizer is the home page. Return to it by clicking the avatar, agent name, or factory path. Rules and Optimization checklist are temporarily hidden from navigation.

- **Agent filter:** select one client using the icons below the avatar. The same selection applies to Context, Rules, Skills (including Whiteboard), and Token Optimizer. Click the selected icon again to show all agents. All agents are selected at startup. The project/user scope filter is restored from localStorage in this browser.
- **Context:** interactive graph with pan, zoom, draggable nodes, and file previews. Solid lines are explicit references; dashed lines show nested instruction scopes. Switch to Files for a table with line counts and client discovery. Filter by coding agent in either view.
- **Rules:** searchable list of dedicated Cursor, Claude Code, and GitHub Copilot instruction files, with source paths, declared file conditions, client discovery, and previews. Metadata does not prove a rule loaded in a session.
- **Skills:** names, descriptions, invocation policy, source paths, and discovery indicators for Cursor, Claude Code, Codex, and GitHub Copilot in VS Code. Identical copies in the same scope are grouped, retaining their paths.
- **Skills Whiteboard:** switch from Files to Whiteboard to arrange every skill as a draggable card, connect your workflow with arrows, and add movable text titles. Solid blue arrows show explicit references in SKILL.md and cannot be edited. Dashed amber arrows are your local drawings: select one to delete it, drag its endpoints onto other cards, or change its From and To menus. All skills discoverable by the selected agent stay visible, including unused ones. Select a card and choose Open skill to inspect it; arrow keys move focused cards and titles. Pan, zoom and Fit skills help navigate larger inventories. Wheel and trackpad zoom stays anchored under the pointer and scales gradually with scroll distance; the zoom buttons use the center of the canvas. Use Fullscreen to expand the board across the browser viewport; Exit fullscreen or Escape restores the page without changing the composition.
- **Project and User:** green and purple distinguish assets in the selected folder from assets in supported home-directory locations. Scope filters work in all views.

On Windows, user asset paths are shown as full filesystem paths so you can copy them into Explorer. On other systems, paths under your home directory use `~/`.

Search with `/`, close the preview with Escape, and use Rescan after changing files.

Open a context file or skill to edit its text in the side panel. Choose a source file first when a skill groups identical copies. Save writes that existing file on your machine, then rescans the workspace. If the file changed on disk after you opened it, reopen it before saving. Rules remain view only.

Use Delete file in the same panel to remove a context or skill file permanently. The confirmation shows the exact source path. Deletion is refused if the file changed after opening it, or if the scan found multiple paths to the same file. Symlinks cannot be deleted from the viewer. The workspace is rescanned after deletion.

```bash
npx @codeursenior/pek audit agent /path/to/project
npx @codeursenior/pek audit agent --project-only
npx @codeursenior/pek audit agent --port 4317 --no-open
```

The default loopback port is **4242**, a nod to the answer in The Hitchhiker's Guide to the Galaxy. If it is occupied, close the other instance or pass `--port <number>`; the CLI does not silently change ports. Use `--port 0` to request an available port. The terminal URL includes a session token. Keep that URL private while the viewer is running.

Whiteboard positions, manual arrows and titles are automatically saved in **localStorage for each project**. They are local to this browser and port, and are lost if you clear its site data. Use the same browser and port to restore your board at the next launch. Switching between Files and Whiteboard keeps the composition. The global agent filter hides unrelated cards and their arrows without changing saved positions, titles, or drawings. Scope and search filters in the table do not hide whiteboard cards. Inventory and source arrows update only at startup or Rescan; added skills appear beside the existing layout, while removed skills and their attached arrows leave the board. Editing a skill's content preserves its position. No skill files are changed or executed by whiteboard drawings. File-based sharing such as `skill-map.json` is not implemented.

## Optional agent identity

Give the agent a name and avatar in the sidebar by adding either or both files to the selected project's root:

```text
.agents/
  NAME.md
  AVATAR.png
```

`NAME.md` contains the display name, for example `Atlas`. The first non-empty line is used; an optional Markdown heading prefix (`# Atlas`) is removed. Other Markdown is displayed as plain text. Names are limited to 100 characters, with no control characters, in a UTF-8 file of at most 4 KiB.

Use `AVATAR.png` or `AVATAR.jpeg` for the image, up to 2 MiB. The file signature must match its extension. PNG takes priority when both files pass those checks. The image is cropped to a circle; if the browser cannot decode it, the default icon remains.

These are optional, independent settings: without a valid name, the sidebar uses the scanned folder name with its first letter capitalized; without an avatar, it keeps its default icon. The factory path appears below Agent Visualizer. Click **Rescan** after adding, changing or removing either file.

This is an internal Agent Visualizer convention, not an ecosystem standard or a configuration for other coding agents. Only `.agents/` directly under the selected root is used, with the exact filenames above; nested projects and home-directory identities are not inherited. Symlinks outside the selected project are ignored. Images are delivered with the authenticated scan, without an external image request or a public file route.

## What is discovered

| Asset        | Project                                                                                                                                     | User                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Instructions | `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.local.md`, `GEMINI.md`, `.github/copilot-instructions.md`, including nested folders | `~/.codex/AGENTS.md`, override, `~/.claude/CLAUDE.md`, `~/.cursor/AGENTS.md`, `~/.copilot/copilot-instructions.md` |
| Rules        | `.cursor/rules/`, `.claude/rules/`, `.github/instructions/**/*.instructions.md`, and legacy `.cursorrules`, including nested folders        | Supported Cursor and Claude Code rule directories; `~/.copilot/instructions/**/*.instructions.md`                  |
| Knowledge    | Markdown under supported agent knowledge folders, other linked local documents                                                              | Supported agent knowledge directories                                                                              |
| Skills       | `SKILL.md` files under supported agent directories, including `.github/skills` for Copilot                                                  | `~/.agents/skills`, `~/.claude/skills`, `~/.cursor/skills`, `~/.copilot/skills`, legacy `~/.codex/skills`          |

`CODEX_HOME` is respected. Markdown links, Obsidian wikilinks, backtick file paths and `@file.md` references connect context nodes. Unrelated Markdown stays out of the graph. Symlinks within the selected folder and supported agent home directories are resolved and deduplicated. External symlinks are excluded.

Context client icons start at recognized instruction files and follow explicit local references through the graph. A linked document can appear for several clients when their entry points converge. Folder-scope lines do not import files, and unlinked knowledge files have no client entry point. Project-root `CLAUDE.md` is shown for both Claude Code and Cursor because Cursor also reads it; nested and user Claude instructions are shown for Claude Code. Project `AGENTS.md` is shown for Codex, Cursor, and GitHub Copilot. Copilot's repository and personal instructions stay in Context, while `.github/instructions` and `~/.copilot/instructions` appear in Rules with their declared `applyTo` patterns. These icons describe possible file discovery, not a confirmed read in a running conversation.

Codex behavior instructions in `AGENTS.md` stay in Context. Codex `.codex/rules/*.rules` are command approval policies and are not included in Rules. Cursor user rules configured only in application settings cannot be read from the filesystem.

Client icons show **file-based discovery**, not whether an application is installed, whether a skill's dependencies are available, or whether an asset is active in a particular conversation. Nested skills may only load when that client works in their folder. A skill outside recognized directories is listed with inactive client icons.

Claude/Cursor/Copilot `disable-model-invocation` and Claude/Copilot `user-invocable` frontmatter are read. Codex `agents/openai.yaml` policy `allow_implicit_invocation` is read separately. Hover an icon or open a skill to inspect per-client invocation. Legacy `.codex/skills` paths are identified in details. Bundled skills under `.codex/skills/.system/` are attributed only to Codex; ordinary skills in `.codex/skills/` remain discoverable by Cursor through its compatibility imports.

## Honest limits

This is an inventory of the selected subtree and supported user locations, not a reconstruction of a live agent prompt. It does not yet model parent-folder inheritance above the selected root, managed enterprise rules, remote account assets, plugin caches, client settings overrides, VS Code profile settings, or effective precedence. Copilot custom agents and prompt files are not shown. It does not interpret every Markdown construct; ambiguous wikilinks remain unconnected. Dependency/build folders and arbitrary hidden folders are skipped. Scans are limited to 20,000 files, 35 folder levels and 512 KiB per context document, with warnings when limits are reached.

## Privacy

The application binds to `127.0.0.1` only, checks Host and Origin, and requires a random session token for data requests, edits, and deletions. Scans and inventories stay in memory. Saving or deleting a context file or skill changes that file on disk. There is no telemetry, CDN, external font or AI API. File scanning is passive.

Context and skill previews display their actual text locally. Treat the open dashboard like your editor: documents may contain private information.

## Development

Use Node.js 24 for development. The published CLI still supports Node.js 20 or newer; it includes compiled JavaScript and the prebuilt UI.

```bash
npm ci
npm run check
npm start -- /path/to/project
```

The server and scanner use strict TypeScript compiled to Node ESM. The UI uses Angular 22 with signals and standalone components. D3 owns the graph's SVG inside an Angular component. Source lives in `src/` and `ui/`; static images and the existing stylesheet live in `public/`. Build output in `dist/` is ignored by Git.

From this package directory:

| Command                        | Purpose                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `npm run check`                | Lint, formatting, strict types, production build, and Vitest tests             |
| `npm run test:server`          | Fast scanner and HTTP regression tests; build first for static asset tests     |
| `npm run test:ui`              | Angular component, state, and HTTP tests through the Angular CLI               |
| `npm run test:coverage`        | Backend and UI coverage reports, without percentage thresholds                 |
| `npm run test:e2e`             | Chromium interaction tests and visual comparisons against the production build |
| `npm run test:package`         | Pack the existing build and test an isolated production-only installation      |
| `npm run test:reproducibility` | Rebuild and compare every distribution file with the previous build            |

Run `npx playwright install chromium` before browser tests. Visual baselines were captured from the original UI on Windows with the locked Chromium version. CI runs comparisons on Windows; Linux and macOS run unit/integration and package compatibility checks. Keep screenshots in the same rendering environment when updating baselines, and review each changed image. Tests use synthetic project and home directories, never the contributor's agent configuration.

`npm start -- /path/to/project` builds before starting. After source changes, stop and restart it to rebuild both halves. End users running the published `pek audit agent` command need no build step. Development tooling and smoke-test runners stay outside the npm archive.

See [architecture and discovery notes](docs/architecture.md) and [release instructions](https://github.com/codeursenior/product-engineer-kit/blob/main/docs/releasing.md).

MIT © Simon Dieny. Independent project, not affiliated with Cursor, Anthropic, or OpenAI.

## Token Optimizer

All agents are selected at startup. The home page estimates their combined startup and on-demand context, counting shared entries once. Select an agent below the avatar to narrow the estimate, compare one-load input costs using maintained model presets, and inspect the largest files and skills. The RTK checklist detects installation and provides manual installation instructions. These are static local estimates, not session usage or spending. See [the estimation method and limits](docs/token-optimizer.md).
