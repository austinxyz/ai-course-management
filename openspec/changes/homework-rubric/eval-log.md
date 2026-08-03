# Eval Log — homework-rubric

<!-- Appended by evaluator subagent after each N.E EVAL run -->

```yaml
- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All SHALL statements in contract satisfied—rubric table, CHECK constraint, scalar subquery architecture, total_max logic, PUT upsert/delete, test coverage"
    - "runtime: All 30 tests pass including 3 new rubric tests and roundtrip verification"
    - "code: No CRITICAL/HIGH issues—proper SQL parameterization, NULL handling, session management, and transaction safety"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 97}
  total: 99
  status: PASS
  findings:
    - "spec: All SHALL requirements met—entry point on course page, items auto-listed from submissions, empty values allowed, non-positive integers rejected with error, whole-table PUT semantics"
    - "runtime: 6/6 RubricEditor tests pass (items auto-listed, save, empty-not-blocking, reject non-positive with error, load error handling, courseId change re-fetch); 54/54 sibling courses tests pass, zero regressions"
    - "code: No CRITICAL/HIGH issues found. Type safety correct (RubricItem interface, number|null handling). Immutable updates using spread operator. Error handling proper with role='alert' on errors. Following conventions: no snake→camel mapping, requireSitePassword(), ActionResult pattern. Minor: act() warnings from sibling test mocks are testing hygiene only (tests still pass)"

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 98}
  total: 99
  status: PASS
  findings:
    - "spec: All four SHALL requirements met—detail panel shows 'X / max' + bar when max configured; no max → raw score only, no bar; total progress bar with three-tier color only when ALL items configured; roster sparkline displays tiny bars for configured items only, same three-tier coloring"
    - "runtime: All 46 tests pass including 9 new tests covering: score bar three-tier coloring (≥90% green, 70%–90% yellow, <70% red), no bar when max null, total progress bar only when all items configured, sparkline bar rendering and filtering"
    - "code: No CRITICAL/HIGH issues found. Type safety: proper null checks for max/totalMax at all read sites (lines 348,355,357,458-460,472-478,489,503,508,516). Color logic: scoreTone() threshold is ≥0.9/≥0.7/else, used identically via TONE_TEXT/TONE_BG maps for detail panel, total bar, and sparkline. CSS tokens: --color-warning properly added and wired alongside existing success/danger. Minor observations (boundary tests for 0.9/0.7 exact values, aria-labels for sparkline bars) are non-blocking"
```
