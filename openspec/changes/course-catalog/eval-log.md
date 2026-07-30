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
