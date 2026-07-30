# Eval Log — course-scheduling-fields

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Attempt 1 (2026-07-30)

```yaml
group: "1+2"
attempt: 1
date: 2026-07-30
commit: 7eb7c5e

scores:
  spec: 95
  runtime: 100
  code: 88
  total: 96

status: PASS

findings:
  - group: 1
    category: spec-compliance
    level: pass
    summary: All SHALL statements from contract 1 implemented and tested
    details: |
      Duration in minutes (15–600): CourseDurationMinutes validator enforces range.
      Tested on create (test_duration_is_recorded_in_minutes) and update (test_duration_out_of_range_is_rejected with parametrize over [0,-1,14,601]).
      
      Default timezone field: default_tz: TimezoneName exists in CourseCreate and CourseUpdate.
      Tested: test_course_has_a_default_timezone, test_unknown_default_timezone_is_rejected.
      
      Default timezone SHALL NOT backtrack sessions: Confirmed by test_changing_the_course_default_timezone_leaves_sessions_alone.
      Patch default_tz, verify existing session.tz and session.starts_at unchanged.
      
      Unknown IANA names rejected: TimezoneName validator uses ZoneInfo, raises ValueError on unknown.
      Tests: test_unknown_default_timezone_is_rejected (create) + existing test_unknown_timezone_is_rejected (update).
      
      Migration backfill: `update courses set duration_minutes = hours * 60;` (line 17 of SQL).
      Post-migration: test_duration_defaults_to_two_hours_in_minutes confirms result is 120 (2*60).
      
      TimezoneName reused: Yes, single validator definition used in CourseCreate, CourseUpdate, SessionCreate, SessionUpdate.

  - group: 2
    category: spec-compliance
    level: pass
    summary: All SHALL statements from contract 2 implemented and tested
    details: |
      Storage format (local_date + local_time + tz name): SessionCreate has local_date, local_time, tz.
      No fixed UTC offset columns in CourseSession model.
      
      Timezone by recording time, default to course default: SessionCreate.tz is TimezoneName | None = None.
      Router apply logic: fields["tz"] = fields.get("tz") or course.default_tz (line 262 of routers/courses.py).
      Tested: test_a_new_session_defaults_to_the_courses_timezone.
      
      Conversion base is session's own timezone: test_a_session_recorded_in_eastern_converts_by_eastern confirms.
      Hardcoded date 2026-07-31 (summer time). Eastern 20:30 → Pacific 17:30 same day, Shanghai 08:30 next day.
      Not vulnerable to DST flakiness.
      
      Timezone validation on both create/update: SessionCreate.tz and SessionUpdate.tz both use TimezoneName.
      test_unknown_timezone_is_rejected tests both paths (line 216 patch test).

  - group: "1+2"
    category: code-duplication
    severity: MEDIUM
    file: backend/app/schemas.py
    lines: "232-244, 299-311"
    summary: Duplicate timezone validator definitions
    details: |
      _known_timezone function defined twice identically.
      TimezoneName type alias defined twice identically.
      Both definitions are functionally equivalent; second shadows first.
      
      Recommendation: Remove lines 299-311 or consolidate to single definition.
      Impact: Code quality only, no correctness issue. All validators active and working.

  - group: "1+2"
    category: migration-backfill-coverage
    severity: INFO
    summary: Migration backfill formula not directly tested
    details: |
      Author flagged: Backfill expression (hours * 60) cannot be tested on empty local DB.
      Only result (120 = 2*60 default) verified post-migration.
      
      Acceptable because:
      • Formula is trivial (multiply by 60)
      • Production data: single row with hours=2, immediate overwrite by import script
      • Rollback note honestly documents lossy behavior
      • Post-migration state is verified by test_the_hours_column_is_gone
      
      Conclusion: No risk. One-off migration with simple formula and verified outcome.

  - group: "1+2"
    category: verification
    severity: INFO
    summary: Structural verification complete
    details: |
      ✓ hours column gone from model, schemas, router, migration (grep confirms zero refs)
      ✓ Migration backfills with hours*60 not default (SQL line 17)
      ✓ Changing default_tz does not alter existing session.tz or starts_at (test confirms)
      ✓ SessionCreate.tz is Optional, router applies course.default_tz when omitted
      ✓ TimezoneName validator used consistently across 4 schema classes
      ✓ Duration bounds 15-600 enforced on both create (test line 212) and update (test line 216)
      ✓ Eastern-to-Shanghai test pins 2026-07-31 to avoid DST flakiness
      ✓ All 97 tests pass (0 failures, 0 regressions)

fix_tasks: []
```
