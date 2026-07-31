# Eval Log — homework

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 7 SHALL requirements implemented and tested"
    - "runtime: 21/21 tests pass, no import errors"
    - "code: No CRITICAL or HIGH issues; contract requirements all met"
  notes:
    - "Code review found 2 LOW issues (non-blocking): skip list deduplication, Student.archived_at check"
    - "All test scenarios exercise actual failure modes (ordered-list assertion for JSONB, verbatim-total with mismatched row, idempotent replay, separated skip lists)"
    - "Migration clean and complete; conftest.py delete ordering correct"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "spec: All 4 SHALL requirements verified — deduplication rule (later wins, tie-break), explicit --course, separated skip lists, UTF-8 output"
    - "runtime: 27/27 tests pass; parsing.py is pure (zero network/file imports); dry-run correctly walks full parse path without HTTP"
    - "code: No CRITICAL/HIGH issues; 1 MEDIUM (missing integration test for describe() rendering of parse-layer skip lists); 3 LOW (truncation in _score, unused db_session param, type hints); verdict: Ready"
  notes:
    - "Clean separation verified: parsing.py handles disambiguation/column-classification, sync.py handles I/O/rendering, payload schema aligned with backend"
    - "cp1252 edge case genuinely tested with cp1252-strict TextIOWrapper; mutation of _say() to print() would fail the test as documented"
    - "Manual verification confirms describe() rendering works correctly; test gap is coverage, not functionality"
    - "Path inference correctly rejected with examples (session3/session4 rubric swap); course resolved through same course_aliases table as backend"
