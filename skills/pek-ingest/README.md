# PEK Ingest

`pek-ingest` turns supplied documents and validated decisions into durable, linked project context. It uses the conversation and files accessible to your agent.

## Install and invoke

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-ingest -g -a codex
```

`-g` installs for your user account. Omit it to install for the current project. Installation uses the [skills CLI](https://github.com/vercel-labs/skills); the skill itself has no runtime, API key, or dependency on Agent Visualizer or another skill.

In Codex, start a new session after installation and invoke, for example:

```text
$pek-ingest Record the durable decisions from this discussion in the project context.
```

Codex can select it automatically when the request matches, or you can invoke it explicitly.

For Claude Code or Cursor, replace `codex` with `claude-code` or `cursor` in the installation command and use that agent's supported invocation mechanism. The workflow is portable Markdown; `agents/openai.yaml` policy applies to Codex only. These harnesses have not been behaviorally verified for this skill.

## Scope and limits

The invocation requests context edits in the current project. The skill searches for existing notes, follows project instructions, preserves source links, and reports contradictions instead of inventing a resolution. Global user context requires an explicit request or workspace instruction. It does not copy a private source into public documentation.

Obsidian handling is included as instructions for preserving properties, links, embeds, and attachments. No Obsidian skill, plugin, or application is required for Markdown edits. Rendering and unavailable linked sources are reported as verification limits. It cannot retain information beyond the files it actually updates.

Commits follow the current project's rules. Pushing, publishing, or changing unrelated agent settings requires separate authorization.

## Updates and distribution

```bash
npx skills update pek-ingest -g
```

Start a new session after updating. If installed files remain stale, reinstall using the install command with `-y` and inspect the installed `SKILL.md`.

GitHub is the source of the installable files after the public mirror synchronizes. The [skills.sh directory](https://skills.sh/docs) uses CLI installation telemetry for discovery, so indexing may lag behind GitHub availability. There is no separate upload step. See [skill provenance](https://github.com/codeursenior/product-engineer-kit/blob/main/docs/skill-provenance.md) for redistribution details.
