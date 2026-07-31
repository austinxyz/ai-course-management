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
