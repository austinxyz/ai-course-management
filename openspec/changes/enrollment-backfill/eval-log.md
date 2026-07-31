# Eval Log — enrollment-backfill

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All three value types correctly defined and validated"
    - "runtime: All 22 tests pass including 3 new source-specific tests"
    - "code: No CRITICAL or HIGH issues; correct Pydantic request/response pattern"
  fix_tasks: []

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 22 derived enrollments correctly marked with source='derived' in API payload"
    - "runtime: All 14 tests pass (5 planning + 3 backfill + 6 integration scenarios)"
    - "code: All 8 contract points satisfied; no CRITICAL or HIGH issues; alias lookup via normalize_alias() with fail-fast; session4 skipped with reason; enrolled_at uses course minimum session date or aborts; unmatched students listed email-only; idempotency via 409 DB constraint; dry-run default; --apply-only write path; no --undo"
  fix_tasks: []
