---
name: pek-grill-me
description: Clarify an idea, plan, or decision through a one-question-at-a-time interview in a local browser chat while the current Codex agent keeps the context.
---

# PEK Grill Me

Interview the user about the subject supplied with this skill. You are the interviewer in this Codex session. The local page is only a text transport. Do not start a second AI session, implement the discussed project, or create a spec, handoff, or other document.

Explore facts available through your tools before asking the user. Resolve decisions and their dependencies one at a time. Every question must include your recommended answer and why you recommend it. Offer 2 to 4 choices when the decision has meaningful alternatives; keep open questions as free text. Wait for the answer, then use it to choose the next question. If the user says the subject is sufficiently clear or asks to stop, close the session yourself with the `close` command. Do not invent a decision if an answer was not received.

## Start

Run `node <this skill directory>/scripts/relay.mjs` in a persistent local terminal. It prints one JSON line containing `base`, `token`, and `url`, and opens the default browser. Keep the terminal alive. If it exits or the browser does not open, explain the error in Codex and offer the printed URL for manual opening. Do not put the token in public output or committed files.

Publish a free-text question with `node <this skill directory>/scripts/agent.mjs question BASE TOKEN`, passing its text, including the recommendation and reason, on stdin. For a choice question, use `node <this skill directory>/scripts/agent.mjs question BASE TOKEN json` and pass a JSON object on stdin: `{"text":"Which direction?","choices":[{"id":"a","label":"Option A"},{"id":"b","label":"Option B"}],"recommendedId":"a","recommendationReason":"Why A fits best."}`. Choice IDs must be unique, and the recommended ID must match one choice. The command prints an acknowledgement. Use the exact `base` and `token` printed by the relay. The relay listens only on `127.0.0.1`.

## Interview loop

Call `node <this skill directory>/scripts/agent.mjs wait BASE TOKEN CURSOR` and read its JSON output. Start with cursor `0`; on each call set the cursor to the highest event `id` returned. A wait may return an empty `events` array after 25 seconds; call it again. Only a `role: "user"` event is a browser answer. A `role: "system"` event with `closed: true` ends the interview. The history includes your questions, so skip your own `role: "agent"` events. You may run other local tools between waits to verify facts; return to the same relay afterward.

After every user answer, acknowledge the decision in your own reasoning, verify any newly relevant facts, and publish one next question. A chosen option arrives as its label, optionally followed by a clarification. A free response arrives as written. If the answer says the interview is complete, call `node <this skill directory>/scripts/agent.mjs close BASE TOKEN` instead of asking another question. Do not ask questions in the Codex chat while the browser interview is running. If a relay call fails, say so in Codex, try `history` once to recover accepted answers, and avoid repeating a question until you know whether the preceding call succeeded.

On close, call `node <this skill directory>/scripts/agent.mjs history BASE TOKEN` to retrieve accepted exchanges. Then call `node <this skill directory>/scripts/agent.mjs close-ack BASE TOKEN` to give the page up to three seconds to display the finished state, and stop the relay terminal. The page tries to close its tab; if the browser blocks that, it tells the user to close the tab. Keep the answers in this Codex conversation by briefly restating the actual decisions received. Do not generate a deliverable or take action on the discussed project. If the relay has failed, report which answers were confirmed and which may be missing.
