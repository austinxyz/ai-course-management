# Eval Log — student-management

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores:
    spec: 100
    runtime: 100
    code: 95
  total: 99
  status: PASS
  findings:
    - "spec: All 4 SHALL statements satisfied — email PRIMARY KEY enforces uniqueness at schema layer, test validates constraint rejection, no surrogate id, NO CHECK constraints, NOT NULL DEFAULT pattern used throughout"
    - "runtime: test_duplicate_email_insert_raises_integrity_error PASSED in 0.14s, zero import/connection errors, fixture isolation verified"
    - "code: Design decisions #1-3 correctly implemented; minor quality note — conftest.py fixture functions lack Python type hints (MEDIUM, non-blocking)"

- group: 2
  attempt: 1
  scores:
    spec: 95
    runtime: 100
    code: 95
  total: 97
  status: PASS
  findings:
    - "spec: All 8 contract requirements met — GET /api/students returns all fields, empty db→[], GET /{email} case-insensitive with 404, wechat→empty string, no Literal validation on reads, TZ calculated from region, lower() used not citext. Deduction: MEDIUM schema risk (missing unique index on lower(email)) flagged by reviewer, valid for future writes but not blocking reads."
    - "runtime: 4/4 tests PASSED (100%), all 5 scenarios covered: list, list-empty, detail-case-insensitive, 404, case-insensitive-matching. No errors, fixtures isolate correctly."
    - "code: 0 CRITICAL/HIGH, 1 MEDIUM (missing unique index on lower(email) — data integrity risk once writes added, recommend follow-up migration), 2 LOW (unused Literal aliases for future write endpoints, functional index gap at scale). Functions <15 lines, no secrets, explicit error handling, design decisions #4 and #8 correctly implemented."

- group: 3
  attempt: 1
  scores:
    spec: 85
    runtime: 100
    code: 80
  total: 90
  status: PASS
  findings:
    - "spec: Server Component (page.tsx) correctly calls getStudents() server-side, Client Component (StudentsClient.tsx) receives students as prop, API module (api.ts) is server-only using BACKEND_URL (no NEXT_PUBLIC_ prefix). Design decision #7 fully implemented. Tests verify architectural boundaries (api.test.ts mocks fetch, StudentsClient.test.tsx confirms badge design token bg-danger). Deduction: large component (280 lines) and comment-only server-only boundary reduce confidence in sustainability."
    - "runtime: 2/2 tests PASSED (100%), StudentsClient badge renders with correct design token class (bg-danger) for unaligned wechat field, api.ts correctly maps snake_case wx_name to camelCase wxName, BACKEND_URL environment variable handling tested. No failures or errors."
    - "code: 0 CRITICAL, 2 HIGH (StudentsClient ~280 lines violates <50 guideline — needs custom hook extraction for state management; server-only boundary relies on comment, ESLint rule would enforce via no-restricted-imports), 2 MEDIUM (type assertion `as Student` bypasses narrowing — ApiStudent.region/level should be typed as Literal unions, not plain string; create/edit/archive flows offline-only as expected for phase 1), 2 LOW (getStudent exported but unused pending mutation endpoint wiring; no error.tsx/loading.tsx for Server Component fetch). Package.json valid JSON. No hardcoded secrets, architecture discipline preserved."
