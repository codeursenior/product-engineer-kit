---
name: pek-root-cause
description: Produce an evidence-based root-cause analysis and a concrete fix plan. Use when asked for an RCA, why something broke, the underlying cause, or a plan that fixes the problem rather than its symptom.
license: MIT
---

# PEK Root Cause

Deliver a clear diagnosis and an actionable fix plan in the user's language. Investigate before recommending changes. The request for analysis does not itself authorize implementing or deploying the fix.

For hard bugs or performance regressions still being reproduced, follow [the diagnostic loop](references/diagnosing-bugs.md) before proposing fixes. It is bundled with this skill; no other skill installation is required.

## Establish the cause

1. Confirm what failed, for whom, when, and how it was observed.
2. Trace data and control flow from the symptom to the earliest incorrect state or missing invariant supported by evidence. Identify the decision, assumption, or design gap that made the failure possible rather than the last handler that surfaced it.
3. Separate the trigger, contributing factors, and root cause. Use one cause per analysis unless there are independent failures.
4. Cite logs, code paths, reproduction steps, or test output. Label unverified explanations as hypotheses.
5. State the root cause in one plain sentence before recommending fixes.

If evidence is insufficient, say what is missing and what to inspect or run next. Do not fill the analysis template with an invented cause.

## Output

Use this structure, omitting empty sections. If the cause is unconfirmed, report the symptom, evidence, hypotheses, and next diagnostic step instead of a definitive fix plan.

```markdown
## Symptom

[Specific observable failure]

## Root cause

[One sentence explaining why the failure was possible]

## Why it happened

[Trigger → mechanism → symptom]

## Evidence

- [File and line, log, failing test, reproduction command, or metric]

## Fix plan

### Plan A: [short name] (recommended)

**Approach:** [What to change and where]
**Steps:**

1. ...
   **Pros:** ...
   **Cons / risks:** [Only real trade-offs]
   **Verification:** [Prove the cause is resolved rather than masked]

## Recommendation

[Choose a plan and explain why in 1 to 3 sentences]
```

Provide one plan when there is a clear correct fix. Add Plan B and optionally Plan C only for real trade-offs in scope, risk, time, compatibility, or ownership. Each alternative must address the same cause differently. If a costly proper fix warrants mentioning a symptom-only patch, label that patch as not recommended and explain what remains unresolved.

Name affected modules or files when known. Do not invent risks to fill the template. When a prior fix failed, explain which symptom it treated and why the cause remained. Keep the report concise enough to act on.
