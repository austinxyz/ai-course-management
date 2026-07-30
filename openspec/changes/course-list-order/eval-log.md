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
