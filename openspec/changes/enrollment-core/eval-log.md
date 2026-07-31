# Eval Log — enrollment-core

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All SHALLs satisfied — table structure, nullable session_id, two partial unique indexes with WHERE clauses, correct FK constraints"
    - "runtime: 4/4 assertions pass (duplicate same-session rejected, duplicate undecided rejected, different sessions allowed, different students allowed)"
    - "code: No CRITICAL/HIGH issues. Implementation matches contract & design precisely. Indexes correctly split NULL/NOT NULL. Minor: session.query() deprecation warnings (style only)"

- group: 2
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All SHALLs satisfied — only enrolled/withdrawn stored, completed derived from session state; make-up via session change only; both delete & withdraw actions; offline courses rejected on create but existing enrollments show"
    - "runtime: 19/19 tests pass including 3 new tests (session must belong to course on POST/PATCH, explicit null on NOT NULL columns rejected, session_id can be null). All five derived states & six write paths covered."
    - "code: No CRITICAL/HIGH issues. Both BLOCK-level fixes correctly implemented: session validation placed in both POST/PATCH with 422 error; explicit null validator correctly excludes session_id (which is nullable). Matches existing StudentUpdate/SessionUpdate patterns."

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All SHALLs satisfied — session enrolled_count excludes withdrawn but includes archived (contract explicitly requires this); undecided_count for session_id=null; enrolled_people deduped by email; deletion guard returns 409 with count for all enrollments including withdrawn"
    - "runtime: 35/35 tests pass (8 new tests for group-3). Verified: per-session count, archive doesn't affect count, write responses carry counts, undecided count, people dedup, deletion guard behavior (enrolled + withdrawn)"
    - "code: No CRITICAL/HIGH issues. EnrollmentCounts NamedTuple for immutable aggregation; tally_enrollments pure function O(n); aggregation in same request as course fetch (no N+1); error detail includes count message. Only minor optimization noted (batch enrollment fetch could filter by course_ids up-front for very large scales, but acceptable at current scale)"
