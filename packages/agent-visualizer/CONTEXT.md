# Agent Visualizer

Agent Visualizer describes the local context available to coding agents. Token Optimizer distinguishes estimated startup context from context available on demand.

## Language

**Selected agent**:
The coding client whose context Token Optimizer estimates: Codex, Claude Code, Cursor, or GitHub Copilot. All agents are selected by default. In that mode, the estimate combines their inventories and counts shared content once; content belongs to startup when any discovering client loads it at startup.

**Estimated startup context**:
The instructions applicable at the start of a session, skill catalog entries, and known MCP discovery components assigned to startup by the selected loading profile. This is the part of the iceberg above water, not a measurement of a running agent's actual context.
_Avoid_: Always-loaded context, actual context usage.

**On-demand context**:
The additional context available through linked documents, skill bodies, instructions scoped to specific subfolders, and deferred MCP definitions. This is the part of the iceberg below water; its total represents available content rather than content necessarily loaded together.
_Avoid_: Hidden token cost.

**One-load input cost**:
The estimated cost of loading one iceberg portion once at the selected model's input price, without caching discounts. For on-demand context, this assumes all available content is loaded once; it does not predict session spending.

**Context reference**:
A link or path in an instruction file pointing to another document. Its text belongs to the referring file's volume; the referenced document's contents belong to on-demand context rather than being automatically added to the startup estimate.

**MCP coverage**:
The completeness of collected catalogs and their classification under an explicitly assumed loading profile. Missing authentication, failed connections and undocumented client behavior produce partial coverage, not zero usage. The pricing model does not select the real coding client's loading behavior. See [MCP context estimates](docs/mcp-context.md).
