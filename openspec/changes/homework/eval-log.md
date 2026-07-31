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

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All 6 SHALL requirements satisfied — driving table is Enrollment, outer join to HomeworkSubmission, four states correctly implemented, deduplication by email, archived/withdrawn filtered, state logic uses derive_session_state, ranking deterministic with tiebreaker"
    - "runtime: 23/23 tests pass including query roundtrip assertion (1 query verified); all four states tested (submitted, missing, not_open, no_session); deduplication, filtering, ranking, and payload tested; anonymous requests blocked"
    - "code: No CRITICAL/HIGH issues. 7 strengths: correct query architecture, comprehensive tests, robust merge logic, deterministic output, type safety, correct filtering, proper null handling. 1 MINOR: missing direct unit test for merge_states (logic correctly verified through integration tests but documented separately for clarity)"
  notes:
    - "Query architecture verified: Enrollment driving table with outer joins to HomeworkSubmission ensures all students appear even without submissions; single roundtrip achieved; test correctly measures query count by reading course.id before zeroing counter to avoid ORM refresh query"
    - "Deduplication robust: merge_states() is named function with specific tests designed to catch 'take first' bug pattern; ORDER BY on name+email ensures stable list ordering across requests"
    - "Filtering correct: archived students and withdrawn enrollments excluded from roster (but submission records remain in DB for archival-reversibility scenario)"
    - "Ranking deterministic: two-field sort key (total desc, email asc) breaks ties; tests verify same ranking order across multiple requests"
    - "Response model uses str for state field (not Literal), avoiding the 500-on-outlier-value pitfall documented in CLAUDE.md"
