# Architecture

`src/cli.js` parses arguments, starts the server for the requested folder and opens the default browser using OS launchers with argument arrays and no shell interpolation.

`src/scanner.js` indexes supported local text files, merges real-path aliases, separates dedicated Cursor/Claude rules from the context graph, extracts context relationships and normalizes skill/MCP metadata. Every scan is a fresh snapshot. Documents are data, never instructions to the application. The API exposes a whitelist of MCP metadata rather than serialized configuration.

`src/server.js` owns the in-memory snapshot and a random session credential. Static routes are an explicit allowlist. Previews and edits use opaque IDs already present in the snapshot, never arbitrary file paths supplied by the browser. Edits are limited to indexed context files and skills, with a size limit and a content revision check before saving. The server validates loopback Host/Origin. Rescans are coalesced. CSP blocks remote code, frames, plugins and inline scripts.

`ui/app.js` renders the graph and tables, filters data locally, and fetches previews on demand. The detail panel offers a plain text editor for context files and skills. Untrusted text is escaped before HTML insertion; document bodies use `textContent` or a textarea value. The session token arrives in the URL fragment, is moved to tab session storage, and is removed from the visible URL. D3 uses deterministic initial positions and a bounded force-layout warm-up.

Client badges use local raster marks from [Cursor](https://cursor.com/brand), [Claude](https://claude.com/), and [ChatGPT](https://chatgpt.com/). The Codex discovery indicator uses the ChatGPT mark. The static asset allowlist keeps these images available without remote requests.

## Discovery references

Behavior was checked against official documentation on 2026-09-21. Runtime behavior can differ by client release or configuration.

- [Codex skills](https://developers.openai.com/codex/skills/): repository and user `.agents/skills` discovery and symlink support.
- [Codex MCP](https://developers.openai.com/codex/mcp/): TOML server definitions and project/user configuration.
- [Claude Code skills](https://code.claude.com/docs/en/skills): `.claude/skills`, invocation metadata, and nested discovery.
- [Claude Code MCP](https://code.claude.com/docs/en/mcp): `.mcp.json` plus user and project-local entries in `~/.claude.json`.
- [Cursor skills](https://cursor.com/docs/skills): `.agents/skills`, `.cursor/skills`, and compatibility with Claude/Codex directories.
- [Cursor MCP](https://cursor.com/docs/context/model-context-protocol): `.cursor/mcp.json` project/user configuration.
- [Cursor rules](https://cursor.com/docs/context/rules): `.cursor/rules` and legacy `.cursorrules`.
- [Claude Code rules](https://code.claude.com/docs/en/memory): `.claude/rules` and `paths` frontmatter.
- [Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md): `AGENTS.md` belongs in Context. [Codex command rules](https://learn.chatgpt.com/docs/agent-configuration/rules) are a separate execution policy.

A live connection indicator needs an explicit integration with each client's running session. Executing commands found in arbitrary repository configuration is deliberately outside the viewer's scope. File-based discovery, configuration enablement, transport reachability and authenticated session connectivity are separate facts.
