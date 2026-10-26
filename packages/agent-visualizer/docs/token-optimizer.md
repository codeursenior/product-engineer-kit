# Token Optimizer design

Status: implemented. The implementation request approved the confirmed decisions below.

## Confirmed decisions

- Make Token Optimizer the home page, with a static context estimate represented as an iceberg. Keep the optimization checklist in its own tab.
- Above water: applicable startup instruction contents and skill catalog entries, including names and descriptions.
- Below water: linked documents, skill bodies, and instructions applicable only in specific subfolders.
- Count a reference's text in its containing instruction file. Do not automatically include the referenced document's contents in the startup estimate.
- Select all agents at startup: Codex, Claude Code, Cursor, and GitHub Copilot. Include their project and user context, counting shared entries once. A shared entry belongs to startup if any agent loads it at startup. Selecting one agent narrows the estimate; clicking it again restores all agents. Reloading starts with all agents regardless of the previous filter.
- These estimates describe discoverable local context, not observed usage in a running conversation.
- Estimate the input cost of loading each iceberg portion once, using the selected model's input price without caching discounts.
- The on-demand price is hypothetical: it assumes all available on-demand content is loaded once. Neither price predicts session spending.
- Provide model presets with input prices maintained by the application. V1 has no custom model or manual price entry; users are not responsible for supplying pricing data.
- Include an extensible checklist starting with "Install RTK". Its checkbox reflects detected installation status, not a user's manual declaration.
- When RTK is detected, show the checkbox checked and disabled.
- When RTK is missing, show the checkbox unchecked and provide installation instructions with a "Check again" button. Do not install RTK from the application. Check and disable the checkbox only after detection succeeds.
- Show only above-water (startup) entries in the breakdown by file or skill, sorted by token count from largest to smallest, with token and word counts. Omit the redundant context, input-cost and byte-size columns. Display the two total prices in USD rounded to four decimal places, with the full unrounded amount in the native browser tooltip. Keep full precision in the API and calculations. Show token and word counts in both portions, without bytes.
- Show context metrics and price estimates for both iceberg portions. Keep the visualization free of the illustration caption and repeated context/pricing caveats. Keep the estimation method and official pricing documented here; omit the expandable details from the dashboard.
- Label the startup-only table "Startup context breakdown". Keep the existing iceberg and table rendered while repricing so that changing the model preserves the page height and scroll position. On refresh failure, retain the previous estimate with an explicit error.
- Exclude quality scores and rewrite suggestions from V1.

## Implementation research

- RTK's [official installation guide](https://www.rtk-ai.app/docs/getting-started/installation/) documents `rtk --version` and `rtk gain` as installation checks. Version output alone is insufficient because another tool shares the executable name. Detection must verify Rust Token Killer specifically.
- Select and document a local token-estimation method and verify model input prices against official provider sources during implementation. Do not imply exact live usage or apply an RTK discount to static file totals.

## V1 implementation

The authenticated `/api/token-estimate` endpoint accepts a supported `client` (including `all`) and `model`. It uses the latest scan snapshot, including a refreshed snapshot after Rescan. `/api/optimization-checks` runs bounded, fixed RTK identity probes on demand. Neither endpoint installs anything or contacts a model provider.

### Estimation method

V1 uses `ceil(Unicode code points / 4)` per entry, whitespace-separated word counts and UTF-8 byte sizes. This lightweight, deterministic heuristic needs no network service or tokenizer dependency. It is approximate, particularly for code and non-Latin text, and is not interchangeable with any provider's tokenizer. Empty text has zero tokens. Totals sum the rounded entry estimates.

A skill catalog entry contains its name, a newline and its description. Description visibility is tracked per agent separately from invocation permissions:

| Agent          | Manual-only configuration                                         | Description loaded at startup |
| -------------- | ----------------------------------------------------------------- | ----------------------------- |
| Claude Code    | `disable-model-invocation: true`                                  | No                            |
| Cursor         | `disable-model-invocation: true`                                  | No                            |
| GitHub Copilot | `disable-model-invocation: true`                                  | No                            |
| Native Codex   | `policy.allow_implicit_invocation: false` in `agents/openai.yaml` | No                            |

For Claude Code, Cursor and Copilot, a manual-only skill's catalog entry stays on demand even at project-root or user scope. Its body also remains on demand. `user-invocable: false` alone controls the user's menu access; it does not remove an automatically visible description. Native Codex excludes the skill from its model-facing catalog when `policy.allow_implicit_invocation: false` is set in `agents/openai.yaml`, while explicit `$skill` invocation remains available. Codex does not interpret Claude's frontmatter flag as a catalog exclusion. Visibility is tracked per physical skill copy, so an automatic nested copy cannot promote an explicitly manual root copy into startup. Both flags disabling invocation hide the description from Claude/Cursor/Copilot as well; the local discoverable content remains in the hypothetical on-demand inventory.

Sources checked on 2026-10-17: [Claude Code context-loading table](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill), [Cursor manual invocation](https://cursor.com/docs/skills#disabling-automatic-invocation), [Copilot invocation controls](https://code.visualstudio.com/docs/agent-customization/agent-skills#use-skills-as-slash-commands), [Copilot's catalog filtering implementation](https://github.com/microsoft/vscode/blob/70cda9d07db24af8754e4a5b6fdb19d94ab66602/extensions/copilot/src/platform/promptFiles/node/automaticInstructionsCollector.ts), and [Codex host catalog filtering](https://github.com/openai/codex/blob/ce0323f2f2d3b25e82806cd555237da3db4e1897/codex-rs/ext/skills/src/provider/host.rs), [Codex executor catalog filtering](https://github.com/openai/codex/blob/ce0323f2f2d3b25e82806cd555237da3db4e1897/codex-rs/ext/skills/src/provider/executor.rs), and [Codex policy reference](https://github.com/openai/codex/blob/ce0323f2f2d3b25e82806cd555237da3db4e1897/codex-rs/skills/src/assets/samples/skill-creator/references/openai_yaml.md). Installed plugin stores, session overrides, active custom modes and preloaded subagent skills are outside this scanner's scope.

In all-agents mode, shared entries still count once. A catalog belongs to startup if any selected agent loads its description at startup; a skill hidden from one agent can therefore remain in the combined startup table when another agent still loads its description. A skill hidden from every discovering agent stays entirely on demand.

A skill's on-demand body excludes YAML frontmatter. Other skill metadata and client-generated catalog wrappers are not modeled. Identical skill copies are grouped; physical context-file aliases are counted once. References are followed locally, including references from rules and skills, with cycle protection. Link text stays in the referring file; linked contents stay on demand unless independently applicable at startup.

Startup means a session at the scanned project root. Root instructions, supported user instructions, unconditional rules and root/user skill catalogs qualify. Nested instructions and nested skill catalogs are on demand. Codex override files replace AGENTS.md in the same folder. Rule conditions use Cursor `alwaysApply`, Claude `paths`, and universal Copilot `applyTo` patterns. Other rules are on demand. Estimates inherit the scanner's file-size, directory-depth, symlink and discovery boundaries. Ancestor instructions outside the scanned root, remote sources, installed plugin stores and session-specific client settings are not inspected. The UI reports when user discovery was disabled and displays scan warnings.

### Maintained pricing

Prices verified on 2026-10-17, USD per million standard uncached input tokens:

| Preset            | Input price | Long-context input price    | Official source                                                            |
| ----------------- | ----------: | --------------------------- | -------------------------------------------------------------------------- |
| GPT-6 Astra       |      $10.00 | $20.00 above 272,000 tokens | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)       |
| GPT-6.1 Sol       |       $2.00 | $4.00 above 272,000 tokens  | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)       |
| GPT-6 Luna        |       $0.10 | $0.20 above 272,000 tokens  | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)       |
| Claude Fable 5.1  |      $10.00 | Same rate                   | [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Claude Opus 5.5   |       $4.00 | Same rate                   | [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Claude Sonnet 5.5 |       $2.00 | Same rate                   | [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Claude Haiku 5.5  |       $0.10 | $0.50 above 100,000 tokens  | [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

GPT-6.1 Sol is selected by default. Use the official API IDs: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`, `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, and `claude-haiku-5-5`. These are the latest verified versions in the requested model families.

Each iceberg portion is priced as a separate hypothetical request. When its total tokens exceed a model's threshold, apply the higher rate to every token in that portion, including entries smaller than the threshold. Exactly at the threshold, use the base rate. The other portion retains its own applicable rate. See [OpenAI's long-context rule](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and [Anthropic's prompt-length rule](https://platform.claude.com/docs/en/about-claude/pricing#long-context-pricing).

Presets are pricing scenarios, not a promise that each client exposes each model. Maintainers update `src/token-estimator.ts` and this table together when prices change. Calculations exclude output tokens, caching, batch discounts, regional surcharges, subscription pricing and repeated session loads.

### RTK detection

Detection requires both a valid `rtk --version` response and the `Rust Token Killer` identity in `rtk -h`, as declared in [RTK's CLI source](https://github.com/rtk-ai/rtk/blob/master/src/main.rs). Short help avoids opening or modifying an analytics database. Each process has a three-second timeout and a 64 KiB output limit. Relative PATH entries and paths inside the scanned project are excluded. Concurrent HTTP checks share one probe. Installation detection does not assert hook configuration or apply a discount to context totals.

The dedicated Optimization checklist tab loads an array of detected checks, initially RTK only. Token Optimizer does not run installation probes, and the checklist does not request token estimates. An unchecked disabled checkbox cannot be marked manually. Installation commands and the official guide are displayed when detection fails; Check again probes the server environment anew.
