# Agent Visualizer

Agent Visualizer describes the local context available to coding agents. Token Optimizer distinguishes estimated startup context from context available on demand.

## Language

**Selected agent**:
The single coding client whose context Token Optimizer estimates: Codex, Claude Code, Cursor, or GitHub Copilot. Context totals belong to this client alone, never to a combined inventory across clients.

**Estimated startup context**:
The instructions applicable at the start of a session and the skill catalog entries, including skill names and descriptions, estimated from local files. This is the part of the iceberg above water, not a measurement of a running agent's actual context.
_Avoid_: Always-loaded context, actual context usage.

**On-demand context**:
The additional context available through linked documents, skill bodies, and instructions scoped to specific subfolders. This is the part of the iceberg below water; its total represents available content rather than content necessarily loaded together.
_Avoid_: Hidden token cost.

**One-load input cost**:
The estimated cost of loading one iceberg portion once at the selected model's input price, without caching discounts. For on-demand context, this assumes all available content is loaded once; it does not predict session spending.

**Context reference**:
A link or path in an instruction file pointing to another document. Its text belongs to the referring file's volume; the referenced document's contents belong to on-demand context rather than being automatically added to the startup estimate.
