# PEK Grill Me

`pek-grill-me` is a Codex skill for clarifying an idea in a local browser chat. The Codex agent in your current task asks the questions. The page has no model or API key of its own.

## Install

Install the skill from the public Product Engineer Kit repository with the [skills CLI](https://skills.sh/codeursenior/product-engineer-kit/pek-grill-me):

```bash
npx skills add codeursenior/product-engineer-kit --skill pek-grill-me -g -a codex
```

Then invoke `$pek-grill-me` with your subject in Codex. If the skill does not appear, restart Codex. Node.js 20 or newer is required. To get a newer version later, run `npx skills update pek-grill-me -g`. The skill runs from its installed directory and has no dependency on the rest of this repository or on another skill.

The skill starts a server bound to `127.0.0.1` and opens your default browser. The terminal prints the local URL if the browser cannot open automatically. The URL contains a secret session token; treat it as private. The browser sends messages only to the local relay. The relay and chat history end when Codex stops the session. Closing the browser tab alone does not notify Codex; use **Fermer** in the page. If the relay exits unexpectedly, return to Codex to continue there.

Codex may request permission to start a local server or connect to `127.0.0.1`, depending on the task sandbox. Approve those local actions for the chat to work; the skill does not need internet access.

No account, model API key, remote host, document export, or installation of Simon's personal skills is required. The answer text stays in the current Codex task's context only to the extent that Codex's ordinary context window retains it.

Verified platform: macOS with Codex desktop. Linux and Windows use `xdg-open` and `rundll32` respectively, but browser opening on those platforms has not been verified.
