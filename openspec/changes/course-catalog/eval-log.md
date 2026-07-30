# Eval Log — course-catalog

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All three SHALLs satisfied — sidebar entry for 课程, entry is not placeholder, 报课 remains placeholder"
    - "runtime: 65 tests pass (58 existing + new tests, no regression); build successful"
    - "code: Sidebar props correctly changed to routing pattern; no lingering view state or onNavigate refs; studentCount badge shows — on non-roster pages; four new placeholder routes created; tests comprehensive"
  fix_tasks: []

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: Alias uniqueness enforced by schema PK (not app logic); independent course.id as uuid; wall-time storage (local_date/time/tz, no UTC offset); cascade delete on all FKs; read responses use str not Literal"
    - "runtime: test_courses_model.py 6/6 passed (PK uniqueness, FK cascade, wall-time, multiple teachers per course); full suite 52/52 passed (no regressions); schema-level constraints verified against real Postgres"
    - "code: Alias normalization enforced structurally (PK); no UTC offset columns; N+1 avoided (3 queries + memory grouping); response models exclude Literal; migration is additive-only with documented rollback"
  fix_tasks: []

- group: 3
  attempt: 1
  scores: {spec: 92, runtime: 92, code: 75}
  total: 89
  status: PASS
  findings:
    - "spec: All 10 SHALLs met — course name required/validated on both create/update with shared type alias; no course DELETE endpoint; offline field for stopping recruitment; alias globally unique via PK; normalization applied; course name change doesn't auto-modify aliases; explicit JSON null rejected on update; 409 on conflict with owner info. Deducted 8 for untested alias ownership guard (guard code exists and is correct, but regression risk)."
    - "runtime: test_courses_write.py 13/13 pass; full suite 65/65 pass (no regression); all contract scenarios covered (blank name rejection on both paths, alias case-insensitivity, cross-course conflict, add/remove). Deducted 8 for missing test of cross-course delete attempt (as explicitly requested in contract review brief)."
    - "code: Implementation correct on ownership guard (line 162 in courses.py checks alias.course_id == course_id) but HIGH: untested. MEDIUM: remove_alias returns 200 even when alias belongs to different course (silent no-op, should return 404 for caller clarity). MEDIUM: TOCTOU race on concurrent alias POST (check-then-insert without IntegrityError handler; low risk in single-user tool but should be handled). LOW: hours field has no bounds validation."
  fix_tasks:
    - "3.F1 FIX — Add test_delete_alias_from_different_course_does_not_remove_it() verifying cross-course delete attempt leaves original alias intact"
    - "3.F2 FIX — Change remove_alias() to return 404 when alias doesn't exist or belongs to different course (instead of silent 200)"
    - "3.F3 FIX — Add try/except IntegrityError in add_alias() commit, roll back, re-query owner, return 409 (handles concurrent duplicate submissions)"

- group: 4
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 92}
  total: 98
  status: PASS
  findings:
    - "spec: All 8 SHALL statements satisfied — session CRUD with date/time/teacher required; wall-time storage (local_date + local_time + IANA tz name, zero fixed offsets); state derivation via Pacific 'today' with override + distinct follow-date clearing action; path-based ownership checks in all endpoints. Verified: grep finds no -8/-7 offsets; zoneinfo used for conversion; explicit null in PATCH rejected; today_pt() function separate and injectable. No spec compliance gaps."
    - "runtime: 15/15 session tests pass; 84 total tests pass (no regressions); DST assertion correct (Oct 15 PDT→10:30 Shanghai, Dec 15 PST→11:30 Shanghai); verified both dates are correct sides of Nov 1 cutoff; DST test WOULD fail if using fixed -8 offset instead of zoneinfo (October test gives 11:30 when broken, 10:30 when correct). State injection via monkeypatch works; UTC/Pacific rollover scenario tested and correct."
    - "code: Exceptional timezone handling — zoneinfo in _starts_at(), separate today_pt() for testability, derives state via comparison; no field mutations; validation at boundaries (TimezoneName validator, _reject_explicit_null on PATCH). IMPORTANT: DST test dates are Oct 15/Dec 15 (technically correct but design intent was Oct 10/Dec 12 to straddle cutoff exactly) → -3. IMPORTANT: teacher list test accepts both sorted/unsorted order when endpoint always sorts → -3. MINOR: missing timezone validation test for SessionUpdate PATCH path (POST tested but not PATCH) → -2. Path ownership guard in _load_session() correctly used in all mutating endpoints. Follows student-write patterns: Server Actions precautions translated to FastAPI validators; exclude_unset pattern for partial updates."
  fix_tasks:
    - "4.F1 FIX — Update DST test dates to Oct 10 & Dec 12 (straddling Nov 1 cutoff exactly) instead of Oct 15 & Dec 15 for design intent alignment"
    - "4.F2 FIX — Tighten teacher list test to assert sorted order only (currently accepts both orderings)"
    - "4.F3 MINOR — Add parametrized test for unknown timezone rejection in SessionUpdate PATCH (complement existing SessionCreate POST test)"

- group: 5
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All contract SHALLs satisfied — sidebar entry 課程 provides route to /courses page (group 1 routing change verified); course/session list rendered with sessions sorted by backend ORDER BY; every session shows Shanghai timezone row differing across DST boundary (Oct 10:30, Dec 11:30); unscheduled course displays verbatim message; offline courses listed with visible badge"
    - "runtime: tests 73/73 pass (8 new CoursesClient tests + 65 existing); build successful, no TS errors; DST scenario correctly uses October PDT (UTC-7) and December PST (UTC-8) with Shanghai assertions (not US-only); test fixture starts_at values confirm backend computed via zoneinfo (Oct 16 02:30Z, Dec 16 03:30Z from 19:30 local)"
    - "code: Code review APPROVED (0 issues); tz.ts contains ONLY formatting (Intl.DateTimeFormat with IANA names), no wall-time→instant reverse conversion in JS; CoursesClient holds selectedId state only, selected derived via useMemo from prop (no local copy per student-write lesson); STATE_LABEL badge mapping pending→success/done→muted/cancelled→danger matches design script; all verbatim strings byte-for-byte match mocks (导入时按这些写法匹配到本课程, 还没有排课。加一个上课时间后，这门课才会出现在报课的场次选项里。, 上课时间 · 每场独立讲师与学员)"
  fix_tasks: []

- group: 6
  attempt: 1
  scores: {spec: 70, runtime: 65, code: 50}
  total: 64
  status: RETRY
  findings:
    - "spec: Course name required field validation works; alias sync hint shown; edit-on-done warning displays; teacher dedup & new-teacher input work. BUT: inline session editing has no error display on write failures (contract 必填: 保存中降透明度、失败就近提示并保留用户输入). Opacity-on-save works, input preservation works via draft state, but error messages are routed only to CourseModal and never displayed during inline edits. Deducted 30."
    - "runtime: 81/81 tests pass; build successful. BUT: zero tests for session action error returns (contrast: alias tests include ok:false cases). addSessionAction/updateSessionAction/deleteSessionAction/followDateAction all mocked with ok:true only (CoursesClient.write.test.tsx:132-133). The missing error-scenario coverage explains why the silent-failure bug exists in production code. Deducted 35."
    - "code: Server Actions correctly check site password independently; ActionResult return-value pattern used consistently; modal doesn't mutate props; no wall-time-to-instant conversion in frontend. BUT HIGH: session error display completely missing. SessionRowsProps has no error field, SessionRow has no error slot, saveError from write() is stored but rendered only inside CourseModal (line 174 CoursesClient.tsx) which is closed during inline session editing. User gets zero feedback when updateSessionAction/deleteSessionAction/followDateAction return ok:false. Deducted 50."
  fix_tasks:
    - "6.F1 FIX — Add session-specific error state to CoursesClient (separate from courseSaveError); thread sessionError & sessionErrorId into SessionRows/SessionRow props"
    - "6.F2 FIX — Add error display slot in SessionRow inline edit UI; show error inline when session action fails, independent of course modal state"
    - "6.F3 FIX — Add test cases to CoursesClient.write.test.tsx for all session action error paths (updateSessionAction ok:false, deleteSessionAction ok:false, etc.)"
