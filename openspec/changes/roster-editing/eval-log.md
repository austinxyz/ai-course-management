# Eval Log — roster-editing

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1 - Attempt 1

- group: 1
- attempt: 1
- scores:
  - spec: 100
  - runtime: 100
  - code: 100
- total: 100
- status: PASS
- findings:
  - "Spec: All three SHALL statements met — name field added to StudentUpdate with StudentName type, trim-and-require validation applied to both create and update paths via single Annotated type alias, other editable fields remain clearable"
  - "Runtime: 42 tests pass (8 new name-related tests added, 34 existing tests still pass); no import errors; all scenarios from spec covered"
  - "Code: Code review approved with no CRITICAL/HIGH issues; StudentName = Annotated[str, AfterValidator(...)] correctly defined once and shared by both StudentCreate and StudentUpdate; sentinel semantics (None = 'not mentioned') preserved; explicit null rejected by existing validator; three required cases tested (missing key, explicit null, blank string); no other fields accidentally constrained"

## Group 2 - Attempt 1

- group: 2
- attempt: 1
- scores:
  - spec: 100
  - runtime: 100
  - code: 100
- total: 100
- status: PASS
- findings:
  - "Spec: Name field successfully integrated into existing field-write pipeline; flows through FIELDS → DetailPanel → updateStudentField without separate UI; backend trim/reject validation is Group 1 responsibility; frontend provides input surface and test coverage for persistence contract"
  - "Runtime: All 49 tests pass across 8 files with zero regressions; three required scenarios verified: (1) name commits through updateStudentField, (2) failed save preserves typed input, (3) rename preserves selection on same email"
  - "Code: Code review found zero CRITICAL/HIGH/MEDIUM/LOW issues; type definitions correctly updated in types.ts (EditableFieldKey, StudentOverride) and api.ts (StudentPatch); no camelCase mapping needed (field name is 'name' on both sides); selection keyed by email verified; mock-data.ts comment correctly documents name as display slot in header vs edit entry point in field table"

## Group 3 - Attempt 1

- group: 3
- attempt: 1
- scores:
  - spec: 100
  - runtime: 100
  - code: 100
- total: 100
- status: PASS
- findings:
  - "Spec: All three SHALL statements fully met — search matches exactly 5 fields (name, email, nick, wxName, wechat) with case-insensitive substring matching; tags and notes explicitly excluded; implementation verified to be manual recognition assistance (filtered candidate list for human selection), not automatic join/deduplication logic"
  - "Runtime: All 57 tests pass (8 new search tests + 34 existing name tests + 15 other); test suite verifies all requirements: five-field matching, case-insensitivity, notes/tags exclusion, name/email backward compatibility; no regressions; placeholder text updated to document WeChat fields are searchable"
  - "Code: Code review APPROVED with zero CRITICAL/HIGH/MEDIUM/LOW issues; plain substring matching (`includes`) with no fuzzy/pinyin/ranking; WeChat fields serve as searchable text for manual candidate filtering, not as automatic identifiers (selection state keyed by email, not by nick/wxName); type safety confirmed (all Student fields non-nullable string); test comments document the WeChat nickname non-identifier constraint; placeholder comment explains discoverability tradeoff"

## Group 4 - Attempt 1

- group: 4
- attempt: 1
- scores:
  - spec: 100
  - runtime: 100
  - code: 85
- total: 97
- status: PASS
- findings:
  - "Spec: Both goals fully achieved — (a) vocabulary successfully moved from mock-data.ts to vocab.ts with TZ_BY_REGION duplication comment added (lines 28-32), content unchanged apart from comment and removal of EditableFieldKeyLike type; (b) synthesized 学員 ID field completely removed: sid removed from FIELDS array, sid synthesis code removed from DetailPanel.tsx:82, sid ternary branch removed from :159, dead `type: 'ro'` branches removed from :228 and :241, EditableFieldKeyLike type alias deleted from types.ts, FIELDS now typed as `keyof Student` not `keyof Student | 'sid'`"
  - "Runtime: Test suite passes with 58/58 tests green (9 test files pass), no regressions; new test StudentsClient.test.tsx:34-42 correctly verifies sid field is gone; TypeScript build passes (5.6s); Next.js build succeeds without errors; import rewrites from mock-data to vocab verified across 7 files"
  - "Code: git mv properly used (commit shows R093 rename, not delete+add); imports updated in separate commit from vocab.ts changes; TZ_BY_REGION comment correctly documents backend/app/schemas.py duplicate (contract requirement for leaving sync note). Code review found 1 MEDIUM issue: type safety inconsistency — line 158 uses `student[fd.key] as string` cast which is still unsafe (fd.key has full `keyof Student` union including tags:string[]) while line 190 still uses original `(student as unknown as Record<string,string>)[fd.key]` pattern, creating two different cast approaches side-by-side instead of uniform tightening. No CRITICAL/HIGH issues. Test for sid removal is well-written with clear comment explaining why email is the real key."
  - "Threshold met: 97 >= 70 ✓"

- group: 5
  production_acceptance:
    build: "placeholder 搜索姓名 / 邮箱 / 微信 present -> new build live"
    sid_row: "absent"
    rows: 20
    nickname_search: pass
    rename_round_trip: "pass — renamed, reload-verified, restored, reload-verified"
    note: "lookups keyed by email through the search box; renaming reorders the list, so trusting the open panel edits the wrong person"
