# Eval Log — student-write

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 75}
  total: 93
  status: PASS
  findings:
    - "spec: All requirements met and tested (update, create, archive/restore, enum validation, soft delete)"
    - "runtime: All 12 tests pass including partial update, email protection, enum validation, clearing notes, create, email conflicts, archive/restore, server timestamp"
    - "code: Design decisions #3-6 correctly implemented; HIGH severity issue: email uniqueness relies on app-layer case-insensitive check but DB enforces case-sensitive PK (allows duplicate emails, breaks cross-system join guarantee)"
    - "code: MEDIUM issues: race condition window between _find() and commit() (TOCTOU), missing email format validation (cross-system key)"
    - "code: LOW issue: archiving already-archived student overwrites original timestamp (design #4 motivation is lost)"
  fix_tasks: []
- group: 1
  attempt: 3
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All SHALL statements satisfied and verified by tests (update, create, archive/restore, enum validation, soft delete, server-side timestamps)"
    - "runtime: All 15 tests pass including partial updates, email immutability, enum validation, note-clearing semantics, create with conflicts (active/archived), archive/restore round trip, server timestamp, lowercase normalization, explicit null rejection"
    - "code: Design decisions #3-6 fully implemented per design.md; email lowercased in StudentCreate validator, DB unique index on lower(email) as backstop; StudentUpdate uses exclude_unset + field_validator to properly distinguish omitted vs. explicit null; no CRITICAL/HIGH issues found"
    - "code: Archive/restore correctly soft-delete via dedicated endpoints, preserving all fields for lossless round trip; server sets archived_at via UTC now(), ignoring caller body"
    - "code: Review notes: TOCTOU window in create (LOW severity, single-user tool); pre-archived re-archive overwrites timestamp (MEDIUM, design trade-off documented)"
  fix_tasks: []
- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 75}
  total: 95
  status: PASS
  findings:
    - "spec: All SHALL statements met—every write entry independently validates credentials via requireSitePassword(); not dependent on proxy.ts alone; unauthenticated requests rejected with no data changes"
    - "runtime: All 26 tests pass; includes required assertions for unauthenticated rejection (actions.test.ts:45-85) and authenticated allowance (actions.test.ts:87-112)"
    - "runtime: HIGH severity gap—contract requires tests verifying X-Backend-Secret is sent on writes; implementation correct (writeRequestInit → backendRequestInit adds header) but api.test.ts only covers reads, no write header verification tests"
    - "code: Shared password logic correctly extracted to lib/site-password.ts; used by both proxy.ts and four Server Actions; Server Action reads Authorization via headers() per design decision #2; no CRITICAL issues found"
    - "code: No authentication bypass, no unguarded writes, no hardcoded secrets; all test fixtures use clearly-fake placeholder strings"
  fix_tasks:
    - "2.F1 Add test asserting X-Backend-Secret header on write operations (e.g. updateStudent representative case) to match contract requirement"
- group: 2
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 4 SHALL statements verified—each write entry independently validates via requireSitePassword(); architecture enforces independent validation (not page-level only); unauthenticated requests rejected before any data changes; shared credential checking prevents drift between proxy.ts and actions.ts"
    - "runtime: All 29 tests pass including 3 required test groups: unauthenticated call rejection (actions.test.ts:45-56), wrong password rejection (actions.test.ts:58-66), all 4 write actions guarded individually (actions.test.ts:68-85), authenticated success (actions.test.ts:87-112), and X-Backend-Secret header on all 4 write operations (api.test.ts:217-235)"
    - "code: Gap from attempt 1 filled—new 'describe(\"write requests\")' block in api.test.ts now verifies X-Backend-Secret header on updateStudent, createStudent, archiveStudent, restoreStudent, plus body-shape and error-propagation assertions"
    - "code: Shared checkSitePassword() correctly extracted to lib/site-password.ts; used by both proxy.ts and requireSitePassword() in actions.ts; Server Action reads Authorization via headers() per design decision #2; no CRITICAL/HIGH issues found"
    - "code: No authentication bypass, no unguarded writes, no fail-open paths; requireSitePassword() throws (not soft error) before any api call; all test fixtures use clearly-fake placeholder strings"
  fix_tasks: []
- group: 3
  attempt: 3
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 6 SHALL statements verified—updates persist after reload (server sole truth source), new records appear in list, archived email conflicts prevent creation without auto-restore, archive hides from active with restore lossless, saving/failure states visible per-field, failed input preserved"
    - "runtime: All 39 vitest tests pass (8 test files) including required assertions: per-field saving state renders (aria-busy one row only), failed saves keep typed value not reverting to stored, failure messages show inline next to field with retry button"
    - "runtime: E2E regression suite confirms deleted local state did not break search, tag/source filters, wechat tri-state, 在读/已归档 toggle, row→detail selection, or new-student modal"
    - "code: Design decision #1 fully implemented—over/added/archived state vars deleted, replaced by server props (students, archivedStudents) passed from Server Component; applyOverride function removed; only pure UI state remains (selected, editKey, editVal, fieldStatus)"
    - "code: Design decision #7 implemented correctly—fieldStatus keyed per-field (format '${email}:${field}'), each field gets independent saving/failed state, error messages and retry buttons appear beside the specific field that failed"
    - "code: DetailPanel branch order fixed: editing branches checked before failed state, so failed enum field can still open picker and user is not trapped on page reload"
    - "code: Server Actions properly guard each entry with requireSitePassword() before calling backend, call revalidatePath('/students') after writes to ensure fresh data; error messages from backend (archived vs exists vs other) correctly parsed and displayed"
    - "code: WritableFieldKey type includes all writable fields (EditableFieldKey + 'note' + 'tags'), eliminating previous cast-to-EditableFieldKey that silenced type checks on tag writes; tags block now has data-field and failure UI"
    - "code: Previous attempts' three HIGH fixes confirmed in place and tested: (1) tag saving uses WritableFieldKey with status tracking, (2) runArchiveAction catches errors showing '没归档成功。', (3) DetailPanel branch order prioritizes editing over failed state"
    - "code: No CRITICAL/HIGH issues found; all regressions tested; migration adds archived_at column (nullable) + unique lowercase email index as backstop"
  fix_tasks: []
