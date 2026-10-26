# PEK Root Cause

`pek-root-cause` investigates a failure and produces an evidence-based diagnosis with a concrete fix plan. It uses the conversation and files accessible to your agent.

## Install and invoke

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-root-cause -g -a codex
```

`-g` installs for your user account. Omit it to install for the current project. Installation uses the [skills CLI](https://github.com/vercel-labs/skills); the skill itself has no runtime, API key, or dependency on Agent Visualizer or another skill.

In Codex, start a new session after installation and invoke, for example:

```text
$pek-root-cause Explain why this test fails and propose a fix plan.
```

Codex metadata preserves explicit-only invocation: use `$pek-root-cause` to load it. It is not selected automatically.

For Claude Code or Cursor, replace `codex` with `claude-code` or `cursor` in the installation command and use that agent's supported invocation mechanism. The workflow is portable Markdown; `agents/openai.yaml` policy applies to Codex only. These harnesses have not been behaviorally verified for this skill.

## Scope and limits

The skill produces an analysis and plan. It does not implement or deploy a fix unless separately requested. Missing evidence leads to hypotheses and a next diagnostic step, not a fabricated root cause. One plan is the default; alternatives appear only for meaningful trade-offs.

The [bundled diagnostic loop](references/diagnosing-bugs.md) covers reproduction, falsifiable hypotheses, targeted probes, regression verification, and cleanup. No separate `diagnosing-bugs` skill is needed. Reproduction depends on access to the affected environment and the project's tools; the skill cannot prove a cause from an inaccessible system.

Commits follow the current project's rules. Pushing, publishing, or changing unrelated agent settings requires separate authorization.

## Updates and distribution

```bash
npx skills update pek-root-cause -g
```

Start a new session after updating. If installed files remain stale, reinstall using the install command with `-y` and inspect the installed `SKILL.md`.

GitHub is the source of the installable files after the public mirror synchronizes. The [skills.sh directory](https://skills.sh/docs) uses CLI installation telemetry for discovery, so indexing may lag behind GitHub availability. There is no separate upload step. See [skill provenance](https://github.com/codeursenior/product-engineer-kit/blob/main/docs/skill-provenance.md) for redistribution details.
