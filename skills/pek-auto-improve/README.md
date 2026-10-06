# PEK Auto Improve

`pek-auto-improve` reviews the mistakes, friction, and validated patterns in your current session. It proposes concise updates to existing skills or project context, then waits for your approval before applying them.

## Install

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-auto-improve -g -a codex
```

Invoke `$pek-auto-improve` at the end of a Codex session. It presents numbered proposals with their target files. Choose the proposals to apply, all, or none. When the conversation contains no lasting lesson, it says so without creating one.

For Claude Code or Cursor, replace `codex` with `claude-code` or `cursor` in the installation command and invoke the skill using your agent's supported mechanism. The instructions need no runtime, API key, or other skill. Installation uses the [skills CLI](https://github.com/vercel-labs/skills); the skill itself uses the conversation and your agent's existing file tools. Codex metadata keeps automatic invocation disabled.

[View on skills.sh](https://skills.sh/codeursenior/product-engineer-kit/pek-auto-improve)

## Updates and scope

```bash
npx skills update pek-auto-improve -g
```

Start a new session after updating so the agent loads the new instructions. If an installation stays outdated, reinstall with the install command above and `-y`.

The skill can only learn from the conversation and files available to your agent. It checks existing instructions before proposing additions and records only the changes you approve. Local commits follow your project's authorization and conventions. Pushing or publishing requires separate authorization. Agent memory is an option only when your environment provides a supported persistent memory mechanism.

Changes become installable after the kit's public GitHub mirror is synchronized. The skills.sh listing is indexed through CLI installation telemetry and may take time to appear, as described in its [FAQ](https://skills.sh/docs/faq).
