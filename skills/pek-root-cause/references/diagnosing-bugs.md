# Diagnostic loop for hard bugs

Adapted from [Diagnosing Bugs by Matt Pocock](https://github.com/mattpocock/skills/tree/main/diagnosing-bugs), under MIT. The copyright notice and full license are included in [../LICENSE](../LICENSE).

Use this loop when a failure is difficult to reproduce or earlier fixes have not resolved it. Read relevant project context and architecture decisions when available. Justify any skipped phase with evidence.

## 1. Build a feedback loop

Before settling on a cause, build a command that can detect the user's actual symptom. Prefer a failing test at the relevant boundary. If that is unavailable, use an HTTP request, CLI fixture, browser script, trace replay, temporary harness, or differential comparison. A successful boot or a nearby failing test is not enough.

Run the command at least once and record the invocation and output. It must fail on this bug, be fast enough to repeat, and run without human intervention where possible. For intermittent failures, repeat the trigger and pin inputs or seeds where possible; measure the reproduction rate rather than calling the result deterministic.

If no useful loop can be built, report what was tried and the missing environment access or artifact needed to continue. Do not convert an untested explanation into a diagnosis. Production instrumentation requires authorization for that environment.

## 2. Reproduce and minimize

Verify that the loop exhibits the reported symptom, including its error, wrong result, or timing. Repeat to check stability or estimate the failure rate. Remove inputs, callers, configuration, and steps one at a time, rerunning after each removal. Stop shrinking when further removal loses the symptom.

## 3. Rank falsifiable hypotheses

For a difficult bug, write 3 to 5 plausible hypotheses ranked by evidence. State each prediction: if X causes the failure, changing Y should remove it or changing Z should worsen it. Discard explanations with no testable prediction.

Show the ranking before testing so the user can contribute known facts; do not require an answer before proceeding within the authorized scope. Prior fixes and deployment history may change the ranking.

## 4. Probe one variable at a time

Map each probe to a prediction. Prefer a debugger or focused inspection, then targeted boundary logs. Mark temporary instrumentation with a unique prefix so it can be removed. For performance, measure and profile the affected path before changing it; use bisection when the regression window is known.

Compare outcomes after changing one variable at a time. If evidence contradicts a hypothesis, update the ranking instead of stacking speculative fixes.

## 5. Verify the causal fix

For this analysis task, name the change and verification in the fix plan. Only implement when separately authorized.

When implementation is authorized, turn the minimized reproduction into a regression test before the fix if a meaningful test boundary exists. It must exercise the real failure pattern, including multiple callers or concurrency when necessary. Run it red, apply the fix, then run it green. Re-run the original, unminimized scenario too.

If no useful test boundary exists, document that limitation and the architectural obstacle; a test at the wrong boundary would give false confidence.

## 6. Clean up and report

Before declaring an implemented fix complete, rerun the original loop, run the regression test if available, remove temporary instrumentation and throwaway harnesses, and state the confirmed cause with supporting evidence. Keep requested diagnostic artifacts only in the project's appropriate location.

Explain what would have prevented the failure. If an architectural improvement is warranted, describe it and its trade-offs after the causal finding; do not silently expand the fix or depend on another skill.
