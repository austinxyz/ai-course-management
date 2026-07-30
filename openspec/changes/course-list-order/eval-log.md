# Eval Log — course-list-order

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## group: 1, attempt: 1

date: 2026-07-30
evaluator: code-review + runtime verification
status: PASS
spec_score: 100
runtime_score: 100
code_score: 95
total_score: 99

### Spec (100/100)
All four contract SHALL statements verified:
- Sorts by earliest session date, descending ✓ (uses `min(dates)`, `_newest_first()`)
- No-session courses prioritized first ✓ (grouping bit 0 vs 1)
- Stable tiebreaker (name, ID) ✓ (explicit tuple components)
- Server-side sorting, client doesn't reorder ✓

Four scenarios all covered by tests passing.

### Runtime (100/100)
- `test_courses_api.py`: 8/8 pass (4 new + 4 existing)
- Full suite: 101/101 pass (97 existing + 4 new)
- No regressions
- Tests use real PATCH (not two GETs) for stability verification ✓

### Code (95/100)
Code review: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW
- Date reversal (`_newest_first`) correctly implements decision #2 ✓
- Tuple composition avoids `reverse=True` pitfall ✓ (would flip tiebreakers)
- Grouping bit avoids sentinel date pitfall ✓ (type uniformity, no future collision)
- App-layer sorting respects decision #1 ✓ (aggregation over already-fetched data)
- ORDER BY on CourseAlias and CourseSession preserved ✓

LOW issues (cosmetic):
1. `_list_order` missing return type annotation (line 138)
2. Local import in `add_session` test helper (line 81)

### Key Claims Verified
1. Earliest session used, not latest: `min(dates)` in line 153 ✓
2. No-session priority without sentinel: grouping bit (0,"") in line 152 ✓
3. Date reversal genuinely needed: test showed `reverse=True` flips name order ✓
4. Stability test uses real PATCH: line 146 in test_courses_api.py ✓
5. No ORDER BY dropped on dependent queries: aliases and sessions have their own ✓

---

## group: 2, attempt: 1

date: 2026-07-30
evaluator: code-review + runtime verification
status: PASS
spec_score: 100
runtime_score: 100
code_score: 95
total_score: 99

### Spec (100/100)
Contract spec requirement: "排序 SHALL 由服务端决定并体现在响应顺序里；客户端 SHALL NOT 自行重排"

Verification:
- Test "按 props 给的顺序渲染，不在前端重排" enforces order preservation without reordering ✓
- Code has no `.sort()` call; iterates input props directly ✓
- Comment "顺序就是服务端给的顺序——这里不排。" explicitly states the contract ✓
- Frontend layout refactor did not introduce any sorting logic ✓

All spec SHALL statements verified.

### Runtime (100/100)
- `npm run test`: 107 passed (includes 105 existing + 2 new order/layout tests)
- `npm run build`: Successful compilation, no errors or warnings
- No existing test regressions
- New tests validate: (1) order preservation, (2) left sidebar isolation with overflow-y-auto ✓

### Code (95/100)
Code review: 0 CRITICAL, 0 HIGH, 1 MEDIUM, 1 LOW

Verified contract code requirements:
- External container: `flex min-h-0 flex-1 overflow-hidden` ✓
- Left sidebar (`<nav>`): `w-[264px] flex-none border-r overflow-y-auto border-border bg-surface-muted` ✓
- Right side: `flex min-w-0 flex-1 flex-col overflow-y-auto bg-background` — **`min-w-0` present** ✓
- Color tokens only: `border-border`, `bg-surface-muted`, `bg-surface`, `bg-background`, no hex values ✓
- Container-only change: `CourseDetail` and content untouched, only wrapper restructured ✓
- No client-side sorting logic introduced ✓
- Inline comment documenting min-w-0 necessity matches pitfall documentation ✓

MEDIUM issue (not blocking):
1. Tests do not directly assert `min-w-0`/`w-[264px]` class strings, so regression (removing `min-w-0`) would not be caught by tests alone. Current implementation correct; gap is in test coverage, not functionality.

LOW issue:
1. Non-selected button background changed from `bg-surface-muted` to `bg-surface`, making selected/unselected differentiation rely only on border color—visual-only, not a contract violation.

### Risk Mitigation
The MEDIUM gap (missing class assertions) is documented via inline code comment and verified during code review; documentation records the pitfall (pitfalls.md).  Future refactors of this layout should re-run tests + visual diff to catch breakage.
