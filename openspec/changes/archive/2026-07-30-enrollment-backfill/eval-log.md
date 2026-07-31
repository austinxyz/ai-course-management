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

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 4 SHALLs met — modify session (including clear), delete enrollment, both in student detail, per-row entry points"
    - "runtime: npm run test (151 passed, 0 failed), npm run build (success), npx tsc (no errors)"
    - "code: All 7 contract Code bullets satisfied; no CRITICAL/HIGH issues — per-enrollment error state isolation, all exits disabled while busy, close-only-on-success with draft preservation, never-resolving-promise test pattern, Server Action return-value error handling, no state re-derivation, proper null/empty-string session handling"
  fix_tasks: []

- group: 4
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All 6 contract SHALLs satisfied — read-only table with 6 columns (student, course·session, enrollment date, status, source, note), course filter chips, '未定场次' shown explicitly when null, empty state message, no edit/delete entry points, placeholder test updated"
    - "runtime: npm run test (153/153 passed), npm run build (success, all routes compiled)"
    - "code: 0 CRITICAL, 0 HIGH issues; 2 LOW issues noted (test regex may false-negative on course names containing filter keywords, missing loading.tsx for /students consistency) — both explicitly non-blocking per reviewer. All contract Code points met: page fetches via lib/api.ts Server Component, no direct backend calls, placeholder routes test correctly removes EnrollPage from list and old placeholder assertions, read-only implementation with no edit controls"
  fix_tasks: []
