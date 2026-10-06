---
name: pek-auto-improve
description: Review a session's demonstrated mistakes, friction, and validated patterns, then propose lasting improvements to skills or project context and apply only those the user explicitly approves.
license: MIT
---

# PEK Auto Improve

When invoked at the end of a session, review the conversation for lessons that could prevent repeated mistakes. Propose concrete improvements before changing any file. The invocation authorizes the review, not the proposed edits.

## Find demonstrated lessons

Look for corrections from the user, avoidable workflow friction, approaches the user explicitly approved, and project instructions or context that proved incomplete, ambiguous, or wrong. Ignore typos and cosmetic preferences unless they reveal a recurring problem.

Ground every lesson in an actual exchange or observed outcome. Do not invent a lesson, infer approval from silence, or turn one task-specific choice into a universal rule. If nothing qualifies, say that no lasting lesson was identified and stop.

Before proposing an edit, read the applicable project instructions and the candidate file. Check whether the lesson is already covered. If a candidate is unavailable, say so rather than claiming it was checked.

## Choose the destination

Prefer an existing skill when it already covers the workflow. Otherwise use the relevant project context file, such as `AGENTS.md`, `CONTEXT.md`, or domain documentation. Create a new skill only for a recurring, specific workflow with no suitable existing home.

Use the project's established locations. For a new project skill without an established location, propose `.agents/skills/<name>/SKILL.md`, with a lowercase hyphenated name and `name` and `description` frontmatter. Keep general project rules separate from domain-specific instructions.

Use agent memory only when the current environment exposes a real, supported memory mechanism. Name the actual destination and its scope. Do not invent a memory path or claim persistence beyond the current conversation.

## Present the proposals

Use the user's language. Show a table before any modification:

| #   | Demonstrated lesson | Destination | Target file or memory | Proposed change |
| --- | ------------------- | ----------- | --------------------- | --------------- |

Include enough detail to review the intended change, with the exchange or outcome that supports it. Ask which numbered proposals to apply, allowing all or none. Wait for explicit approval. If the user approves only some proposals, apply only those. If they decline all, stop.

## Apply approved changes

Re-read the selected targets before editing. Keep each addition concise, usually one to three sentences, and preserve unrelated content and existing user changes. A new skill may need more text to make its workflow self-contained. Do not overwrite an existing file to create one.

Confirm what changed and verify the resulting instructions and references. For repository files, follow the project's commit workflow and make a local commit per completed logical change when its instructions or the user authorize commits. Include only the approved changes; if they overlap inseparably with prior edits, report the conflict instead of committing them together. A separate commit skill is not required.

Do not push, publish, install dependencies, or change unrelated agent settings as part of recording a lesson without separate authorization. Do not copy secrets, private conversation excerpts, or personal data into shared instructions.
