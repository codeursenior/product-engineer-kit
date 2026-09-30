# Architecture

`src/cli.ts` parses arguments, starts the server for the requested folder and opens the default browser using OS launchers with argument arrays and no shell interpolation. TypeScript compiles it to `dist/cli.js`, retaining its executable shebang. The CLI resolves its version relative to the installed package, independently of the caller's working directory.

`src/scanner.ts` orchestrates a fresh snapshot. Modules under `src/scan/` handle filesystem collection, metadata parsing, context/rule/skill discovery, reference resolution and graph construction, and MCP discovery. Parsing starts with unknown values and narrows them before normalization. Context client discovery propagates across explicit reference edges, never folder-scope edges. Documents remain data, never instructions to the application. MCP output is an explicit metadata whitelist, never a serialized configuration.

`src/server.ts` owns the in-memory snapshot, coalesced refresh promise, and random session credential. Modules under `src/http/` handle authentication/security headers, serialized file writes, request validation, and browser asset enumeration. Requests select static files from an allowlist built from `dist/browser`; they never resolve arbitrary paths. Previews and edits use indexed opaque IDs, size limits, and content revision checks. CSP blocks remote code, frames, plugins and inline scripts. Each HTML response receives a fresh nonce for Angular component styles; critical CSS inlining is disabled.

`src/contracts.ts` defines browser-safe JSON shapes shared by the server and UI. Internal snapshot maps and real filesystem write targets live separately in `src/scan/types.ts`. These are internal contracts, not a published library API.

The Angular UI uses standalone OnPush components and signals. `WorkspaceState` owns inventory, navigation, filters, theme and selection; `WorkspaceApi` owns authenticated HTTP requests. Components render the sidebar, filters, tables, graph, and detail editor. Angular text bindings display untrusted content without HTML interpretation. The session token moves from the URL fragment to tab session storage and is removed from the visible URL.

The detail component owns its edit draft and revision. A request sequence prevents late previews or writes from updating a different selection. The graph component delegates only its SVG subtree to the typed D3 renderer. Simulation nodes and links are copies of API data. Initial positions, layout forces and bounded warm-up are preserved; cleanup stops simulations and removes listeners when the graph is replaced or destroyed.

## Extending and testing

- Add filesystem discovery behavior to the relevant scan module, with a synthetic fixture in the backend tests. Test normalization and reference rules as pure functions when possible; retain real filesystem tests for symlinks, scope boundaries, and limits.
- Change shared JSON contracts first when introducing API data. Add transport tests for new routes or file operations. Keep credentials and filesystem capabilities out of browser-visible types.
- Add UI behavior to its owning component or state service, with a Vitest test through Angular TestBed. Use `await fixture.whenStable()` after interactions rather than forced change detection. Keep HTTP calls behind `WorkspaceApi`.
- Keep D3-specific mutations inside the renderer. Validate gestures and production CSP in Playwright against the compiled server; do not rely on DOM emulation for SVG geometry.
- Run `npm run check` before committing. Browser baselines cover the original UI and both themes; update them only for reviewed visual changes. Coverage reports are diagnostic rather than percentage gates.

Development uses Node 24 and the Angular CLI's supported Vitest integration. Backend code is checked against Node 20 types and emitted as ESM; test/build tooling uses newer Node types separately. Angular and D3 are bundled into browser assets and are not installed as runtime dependencies. The npm archive includes only compiled output, documentation and licenses. Build caches, sources and fixtures stay out of it.

Client badges use local raster marks from [Cursor](https://cursor.com/brand), [Claude](https://claude.com/), and [ChatGPT](https://chatgpt.com/). The Codex discovery indicator uses the ChatGPT mark; Copilot uses a local text mark. The static asset allowlist keeps the images available without remote requests.

## Discovery references

Behavior was checked against official documentation on 2026-09-30. Runtime behavior can differ by client release or configuration.

- [Codex skills](https://developers.openai.com/codex/skills/): repository and user `.agents/skills` discovery and symlink support.
- [Codex MCP](https://developers.openai.com/codex/mcp/): TOML server definitions and project/user configuration.
- [Claude Code skills](https://code.claude.com/docs/en/skills): `.claude/skills`, invocation metadata, and nested discovery.
- [Claude Code MCP](https://code.claude.com/docs/en/mcp): `.mcp.json` plus user and project-local entries in `~/.claude.json`.
- [Cursor skills](https://cursor.com/docs/skills): `.agents/skills`, `.cursor/skills`, and compatibility with Claude/Codex directories.
- [Cursor MCP](https://cursor.com/docs/context/model-context-protocol): `.cursor/mcp.json` project/user configuration.
- [Cursor rules](https://cursor.com/docs/context/rules): `.cursor/rules` and legacy `.cursorrules`.
- [Cursor rules help](https://prod.cursor.com/help/customization/rules): project-root `AGENTS.md` and `CLAUDE.md` are both read by Cursor.
- [Claude Code rules](https://code.claude.com/docs/en/memory): `.claude/rules` and `paths` frontmatter.
- [Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md): `AGENTS.md` belongs in Context. [Codex command rules](https://learn.chatgpt.com/docs/agent-configuration/rules) are a separate execution policy.
- [Copilot instructions in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-instructions): repository and personal instructions, `AGENTS.md`, and targeted `.instructions.md` files with `applyTo` metadata.
- [Copilot skills in VS Code](https://code.visualstudio.com/docs/agent-customization/agent-skills): project and personal skill locations and invocation metadata.
- [MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers): workspace `.vscode/mcp.json`, portable `.mcp.json`, and Agent Host `~/.copilot/mcp-config.json`.

A live connection indicator needs an explicit integration with each client's running session. Executing commands found in arbitrary repository configuration is deliberately outside the viewer's scope. File-based discovery, configuration enablement, transport reachability and authenticated session connectivity are separate facts.
