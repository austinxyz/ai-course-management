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
