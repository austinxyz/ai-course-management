# Eval Log — homework-upload

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 90, runtime: 100, code: 85}
  total: 93
  status: PASS
  findings:
    - "spec: All primary SHALL statements about decoding order, error messages, and content-based validation are correctly implemented"
    - "runtime: All 23 tests pass (100%); no import errors in parsing module"
    - "code: MEDIUM finding — README lessons only partially migrated to module docstring. Design defensible: db-level lessons (两份清单处置相反, 覆盖式不是同步式删除) will move to import endpoint in Group 2; this module carries the parsing-relevant lessons."
  fix_tasks: []

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 85}
  total: 97
  status: PASS
  findings:
    - "spec: All 4 SHALL statements met. Server Action only reads/auths/forwards with no business logic. File sent as bytes (arrayBuffer→base64), not text. Expected errors return {ok:false, message}, not exceptions. Users select file without file paths or CLI."
    - "runtime: All 209 tests pass (29 test files); typecheck clean. Actions test suite comprehensive: GB18030 byte sequences verified, dry-run/real flags separated, 4xx errors return values not throw, revalidatePath only on successful write with layout granularity. next.config test pins bodySizeLimit > backend 2MB + 20KB multipart overhead."
    - "code: HIGH finding — importHomework/addExcludedEmail/getLastImport lack direct unit tests in api.test.ts. Reviewer manually verified snake_case↔camelCase mapping is correct, but functions missing unit tests that match the file's established pattern (every comparable function has mapping tests). Implementation is sound (no CRITICAL/MEDIUM issues), but coverage gap should be addressed. next.config bodySizeLimit correctly set to 3mb with proper assertion test."
  fix_tasks: []

- group: 2
  attempt: 1
  scores: {spec: 98, runtime: 100, code: 92}
  total: 97.6
  status: PASS
  findings:
    - "spec: All 8 SHALL statements implemented. Course specification with proper precedence; no path/name/content inference; single endpoint; self-describing response; global exclude list; header mismatch warning (non-blocking); import records only on real write; size limit enforced."
    - "runtime: 45 targeted tests + 209 full suite all pass. No failures, no regressions. MalformedCell test verifies exception carries ref/column/value for proper 422 mapping."
    - "code: MalformedCell exception properly structured for endpoint mapping. dry_run uses correct continue pattern (not rollback). Exclude list as standalone table. Import records only on real write. No old PUT endpoint. Migration includes backfill. Comprehensive error handling and explanatory comments."
  fix_tasks: []

- group: 4
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 75}
  total: 93
  status: PASS
  findings:
    - "spec: All 10 SHALL statements met. Preview screen structure complete (encoding line, counts, superseded rows, two separate skip lists). Confirmation requires explicit action with concrete count. User can mark emails excluded; system reissues preview request (not frontend arithmetic). Target course always current selection, no course selector. Homework page has only one write entry (import). Last import metadata displayed."
    - "runtime: All 208 tests pass; typecheck clean; no console warnings/errors. Tests verify: UTF-8 encoding always shown, GBK with warning, duplicate rows listed, two skip lists with different visual tones (danger vs normal), confirm button shows count, preview doesn't write data, success closes dialog, failures persist on screen. ImportDialog.test.tsx uses hangs() promise to verify all buttons (cancel, close, exclude, confirm) disabled during write. Exclude test verifies second preview request with mockResolvedValueOnce sequence and button text change."
    - "code: HIGH finding — Race condition in exclude→refresh sequence. After onExclude resolves, refresh() sets phase='previewing' immediately, causing busy=false while second onPreview is still in flight. This allows user to click another exclude/cancel during the pending preview, potentially resulting in out-of-order responses and stale counts on the confirm button. Violates design principle that async disable-state must use hangs() test pattern. Tests check second onPreview call count and button text change, but don't verify disabled state persists through the flight window. MEDIUM: Stale error banner from prior confirm() not cleared in exclude() (line 81). LOW: encodingLabel() collapses unknown encodings to 'UTF-8' instead of 'unknown'."
  fix_tasks:
    - "[ ] 4.F1 FIX — Add async-state lock for exclude-triggered preview: either keep phase='writing' through refresh(), or add separate refreshing flag OR'd into busy. Add hangs()-based test verifying second onPreview call keeps all exclude buttons disabled."
    - "[ ] 4.F2 FIX — Add setError(null) at start of exclude() for consistency with confirm()."
