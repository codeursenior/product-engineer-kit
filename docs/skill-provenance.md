# Public skill provenance

`pek-ingest` and `pek-root-cause` adapt skills authored by Simon Dieny for public use. Their public versions are distributed under MIT, with a copy of the license in each installed skill. They do not require access to their original workspace or its documentation. Existing local skills keep their names and files.

## PEK Ingest

The public adaptation replaces workspace-specific conventions with project discovery and includes concise guidance for preserving Obsidian properties, wikilinks, embeds, and attachments. It does not bundle the external `obsidian-markdown` skill or its manual. No additional skill installation is required.

## PEK Root Cause

The analysis workflow is Simon Dieny's. The public adaptation bundles a diagnostic reference adapted from [Matt Pocock's Diagnosing Bugs](https://github.com/mattpocock/skills/tree/main/diagnosing-bugs). Its MIT license, including `Copyright (c) 2026 Matt Pocock`, is preserved in `skills/pek-root-cause/LICENSE` so it travels with an isolated installation. See the [upstream license](https://github.com/mattpocock/skills/blob/main/LICENSE).

The reference preserves the reproduction loop, minimization, falsifiable hypotheses, targeted probes, regression verification, and cleanup. Links to optional workspace helpers and architecture skills are replaced with standalone instructions. Analysis remains separate from authorization to implement a fix.

## Distribution boundary

The skills are installed from GitHub with the skills CLI. They are outside `packages/agent-visualizer/` and its npm archive. Installing Agent Visualizer does not install skills, and installing either of these skills does not install Agent Visualizer. The kit root remains a private npm workspace container.
