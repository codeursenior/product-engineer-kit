# MCP context estimates

The dashboard estimates the input cost of loading discoverable MCP catalog text once. It does not measure a coding client's live session, tool results, provider charges, subscriptions, or conversation spending.

## Collection

After the initial file scan and each Rescan, the local server collects root-project and eligible user MCP catalogs in the background. File scanning itself remains passive. Disabled, nested and overridden configurations are not started. `--project-only` excludes user configurations; `--no-mcp-analysis` disables all MCP connections and launches.

Configured stdio commands run with their argument arrays, working directory and explicit environment, without an implicit shell. This includes package launchers such as `npx` and `uvx`, which can download software and have their normal startup effects. HTTP connections use configured credentials. Browser-only authentication, editor secret stores, interactive inputs and OAuth login are not imported; inaccessible credentials produce an unavailable result. Connection settings, credentials and raw catalog contents remain private to the server process.

Collection only negotiates the connection and lists tools, including pagination. It never calls tools, reads resources or prompts, resolves schema references, or supplies sampling, roots or elicitation capabilities. Server text remains data. No model-provider API is called.

The official MCP client SDK handles stdio, Streamable HTTP and explicit legacy SSE. HTTP uses automatic protocol negotiation with a two-second discovery probe. Stdio and legacy SSE use the legacy handshake so package commands are not launched twice; modern-only stdio is not supported in this version. Authentication failures do not trigger an interactive login or a different-origin retry. HTTP redirects and cross-origin SSE endpoints are rejected.

Two servers are processed concurrently, with a 30-second per-server deadline and a 120-second run deadline. Each catalog is limited to 100 pages, 5,000 tools and 4 MiB. Malformed, repeated or interrupted catalogs are excluded from totals. Connections are shared only for identical normalized connection settings, including credentials and working directory. Tool filters remain specific to each configuration. Connections and launched processes are closed after collection and when a run is cancelled. A new scan owns a new analysis; late results cannot replace its data. Filtering, repricing and changing loading profiles use cached catalog data. Rescan retries unavailable servers.

## Loading profiles

Defaults below were checked on 2026-10-26. They describe a current compatible client, not the installed version or actual model. The price selector is an independent pricing scenario.

| Client      | Documented default                      | Startup catalog components                           |
| ----------- | --------------------------------------- | ---------------------------------------------------- |
| Claude Code | Deferred tool search                    | Tool names and server instructions                   |
| Cursor      | Dynamic context discovery               | Tool names                                           |
| Copilot     | VS Code with compatible tool search     | Tool names and descriptions                          |
| Codex       | Native client with search-capable model | Available source metadata; tool definitions deferred |

Sources: [Claude Code](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search), [Cursor](https://cursor.com/blog/dynamic-context-discovery#4-efficiently-loading-only-the-mcp-tools-needed), [Copilot in VS Code](https://code.visualstudio.com/blogs/2026/06/17/improving-token-efficiency-in-github-copilot), and the [official Codex implementation](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs).

Each client has Documented default, Load upfront and Load on demand scenarios, saved per project in this browser. Manual scenarios take precedence. The documented profile applies locally observable tool filters, Claude `alwaysLoad`, explicitly configured Claude `ENABLE_TOOL_SEARCH`, and Copilot `deferTools`. It does not infer another client's environment from the visualizer's environment. Conditional thresholds and Copilot CLI configurations remain unclassified unless a manual profile resolves the assumption. Cursor and Copilot instruction placement and Codex source descriptions can be unavailable; coverage remains explicitly partial.

## Counting

Tool definitions are projected to names, descriptions, title, input schema, output schema and annotations. Icons and arbitrary `_meta` are excluded. Objects use stable key ordering. Names, descriptions, remaining definition JSON, server instructions and source metadata are disjoint text components. Generated client wrappers are not modeled.

Each component uses the existing `ceil(Unicode code points / 4)` heuristic, whitespace-separated words and UTF-8 bytes. Eager profiles load their known components at startup; deferred profiles keep the documented discovery components at startup and definitions on demand. Unclassified text is not silently assigned to either portion. Unavailable data is never presented as zero; a successfully observed empty catalog is distinct.

All-agents mode unions shared components once. A shared component belongs to startup if any selected client loads it there. Same server names do not establish shared identity. Each iceberg portion retains the existing one-load model pricing, including its own long-context threshold. Totals contain known components only; coverage explicitly identifies omissions. The startup table groups MCP components by server to keep large catalogs readable.

## Verification contract

Use synthetic MCP processes and HTTP/SSE fixtures, the authenticated estimate API, and the rendered Angular dashboard. Verify automatic collection, pagination and limits, no business calls or credential leakage, cleanup, rescan cancellation, disabled and unavailable servers, loading scenarios, all-agent union, long-context pricing, profile persistence and stable scrolling. Test traffic must not use personal configured services.
