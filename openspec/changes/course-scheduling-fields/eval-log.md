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

## Group 3 Attempt 1 (2026-07-30)

```yaml
group: 3
attempt: 1
date: 2026-07-30
commit: 4df57c0

scores:
  spec: 100
  runtime: 100
  code: 100
  total: 100

status: PASS

findings:
  - group: 3
    category: spec-compliance
    level: pass
    summary: All SHALL statements from contract 3 implemented and verified
    details: |
      Timezone selection interface:
      • Users can specify timezone when adding sessions: AddSession form (SessionRows.tsx:351-401) includes ZonePicker component
      • Users can specify timezone when editing sessions: SessionRow edit mode (SessionRows.tsx:220-296) includes ZonePicker component
      • Labels follow selected timezone: Both forms show "时间（{zoneLabel(draft.tz)}）" where zoneLabel maps IANA name to UI label
      • Test: "preselects the course's timezone when adding a session" verifies form shows course default
      
      Duration in minutes (15–600):
      • Stored as duration_minutes (not hours): types.ts Course interface, CoursePatch in lib/api.ts, backend schemas.py
      • Client-side validation: CoursesClient.tsx saveCourse() validates 15 <= minutes <= 600 before submission
      • Server-side validation: backend/app/schemas.py CourseDurationMinutes with Field(ge=15, le=600)
      • Tests: "takes the duration in minutes, not whole hours" (150 case), "refuses a duration outside 15-600"
      
      Course default_tz behavior:
      • Only preseeds ADD forms: AddSession initializes draft.tz to defaultTz parameter (course.default_tz)
      • Does NOT retroactively change existing sessions: SessionRow edit initializes draft.tz to session.tz (not course default)
      • Test: "edits a session with that session's own timezone preselected" explicitly verifies course default differs from session tz and session's own value is preserved on save
      • Critical regression test: Detects silent timezone changes if EDIT were to use course default instead

  - group: 3
    category: architecture
    level: pass
    summary: Timezone chip single-sourcing verified
    details: |
      All timezone chips built from lib/tz.ts ZONE_ROWS:
      • CourseModal.tsx: ZONE_ROWS.map() for default_tz selector (lines 155-162)
      • SessionRows.tsx ZonePicker: ZONE_ROWS.map() for both ADD and EDIT forms (lines 40-49)
      • Same array shared with session card conversion rows (line 208)
      
      No second hardcoded list found anywhere in frontend/:
      • Grep confirms zero matches for hardcoded timezone arrays
      • Design explicitly calls out this duplication risk and enforces single source
      
      API remains unrestricted:
      • backend/app/schemas.py TimezoneName validator accepts any IANA name (zoneinfo.available_timezones())
      • Interface convenience (4 chips) separate from API contract (any IANA)

  - group: 3
    category: copy-and-labels
    level: pass
    summary: No copy claims fixed Pacific timezone
    details: |
      Updated labels to follow selected timezone:
      • CourseModal.tsx: "默认时区 / 新增场次时预选它，不影响已排好的场次" (line 150-152)
      • SessionRows.tsx AddSession: "按所选时区填，其他时区自动换算" (changed from "时间按美西填") (line 379)
      • SessionRows.tsx labels: "时间（{zoneLabel(draft.tz)}）" (dynamic, not fixed) (lines 238, 394)
      • CoursesClient.tsx: "时间按每场自己的时区记，下面一行是其它时区对应时间" (line 357)
      
      No remaining Pacific-specific copy in production code:
      • Grep confirms zero matches for "美西" or "Pacific" outside test descriptions
      • Pre-existing comment in types.ts:6 ("美西当地日期与时间") is documentation-only and marked as pre-existing from group 1

  - group: 3
    category: field-migration
    level: pass
    summary: hours field completely replaced with duration_minutes
    details: |
      No leftover references to old hours field in active code:
      • types.ts Course interface: duration_minutes (not hours)
      • lib/api.ts CoursePatch: duration_minutes, default_tz (not hours)
      • CourseModal.tsx: duration_minutes input with comment explaining why not chips
      • CoursesClient.tsx: displays "150 分钟" (not "2 小时") when duration_minutes = 150
      • Grep confirms zero matches for " hours " in active app/courses code (only in test descriptions)

  - group: 3
    category: runtime-verification
    level: pass
    summary: Tests and build succeed
    details: |
      Frontend tests (npm run test):
      • 99 tests passed (13 test files)
      • Existing tests: all pass, 0 regressions
      • New tests for duration+timezone: all pass
        - "takes the duration in minutes, not whole hours"
        - "refuses a duration outside 15-600"
        - "carries the course's default timezone"
        - "preselects the course's timezone when adding a session"
        - "sends the timezone the user picked"
        - "edits a session with that session's own timezone preselected" (critical regression case)
        - "shows the duration in minutes on the course facts"
      
      Frontend build (npm run build):
      • Compiled successfully in 3.1s (Turbopack)
      • TypeScript check passed
      • All 11 routes generated
      • No errors

  - group: 3
    category: code-quality
    severity: LOW
    file: frontend/app/courses/CourseModal.tsx
    lines: 141-145
    summary: Duration input lacks native HTML bounds
    details: |
      The number input for duration_minutes has no min/max attributes.
      Client-side validation enforces 15-600 (CoursesClient.tsx:93).
      Server-side validation enforces 15-600 (backend schemas.py).
      
      Native min/max would add browser-level feedback (spinner clamping) at negligible cost.
      Recommendation: Add min={15} max={600} to Input for UX consistency.
      Impact: Non-blocking. Contract satisfied.

  - group: 3
    category: documentation
    severity: LOW
    file: frontend/app/courses/types.ts
    lines: 6
    summary: Pre-existing stale comment about Pacific timezone
    details: |
      Comment claims "美西当地日期与时间" (Pacific local date/time).
      This is pre-existing from group 1; not introduced by this diff.
      Now inaccurate: each session has its own tz field; local_date/local_time are wall-clock in session.tz, not fixed Pacific.
      
      Recommendation: Update comment for accuracy.
      Timing: Follow-up task, not blocking group 3 completion.

fix_tasks: []
```
