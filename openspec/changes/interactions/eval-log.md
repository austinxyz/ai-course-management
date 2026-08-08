# Eval Log — interactions

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 80, runtime: 95, code: 65}
  total: 83
  status: PASS
  findings:
    - "Spec: Requirements met (nudge_events source, DESC order, JOIN names, 7-day count, zero case); ordering lacks tie-breaker (CLAUDE.md pitfall)"
    - "Runtime: All 4 tests pass; covers order/JOIN/boundary/zero case; missing explicit tied-timestamp edge case"
    - "Code: 2 HIGH issues—/count materializes rows instead of func.count(); /api/interactions lacks tie-breaker in ORDER BY (documented pitfall)"

- group: 2
  attempt: 1
  scores: {spec: 0, runtime: 100, code: 30}
  total: 46
  status: RETRY
  findings:
    - "Spec: HIGH—default preset is '7d', not 'all'; violates 'default展示全部学员互动历史' (Scenario line 8-9). Older records silently filtered on load."
    - "Spec: HIGH—'today' preset broken: days:0 → since=Date.now(), requires when≥now, excludes all past events. Scenario '按时间范围筛选' with '今天' fails."
    - "Runtime: All 40 tests pass, but fixture timestamps (2026-08-05/06) coincidentally within 7 days relative to current date (2026-08-08), masking bugs."
    - "Code: format.ts migration correct; api.ts typing correct; InteractionsClient defaults+presets logic has 2 HIGH. Bonus: deep-link ?student= code exists but test coverage is group 3 scope (untested in group 2)."

- group: 2
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "Spec: Both HIGH bugs verified FIXED. Default preset now null (not '7d'); today preset uses startOfToday() not Date.now()-0. All 8 SHALL requirements met."
    - "Runtime: 42 tests pass (1 skipped placeholder-routes, correctly removed). Regression tests confirm preset fixes work correctly under actual filtering logic."
    - "Code: APPROVE—0 CRITICAL, 0 HIGH, 0 MEDIUM. 2 LOW: pre-existing dead code in PlaceholderPage (not touched in diff); custom date-range branch untested but logic simple/readable."

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 50}
  total: 70
  status: RETRY
  findings:
    - "Spec: Contract requirement #3 partially broken for production emails. Link href lacks encodeURIComponent()—emails with `+` (e.g. user+tag@gmail.com) silently fail to pre-filter. Test only uses alpha@example.com, masking the bug. Other codebase places (api.ts) correctly encode student emails."
    - "Runtime: 36/36 tests pass, but NudgeClient test insufficient—doesn't cover real email format with special chars. Interactive filtering would still work for manually-typed emails, but deep-link pre-selection fails silently."
    - "Code: 1 HIGH—URL encoding vulnerability. Must use: `encodeURIComponent(person.studentEmail)`. Other code quality good (imports, shared functions, types), but HIGH issue blocks approval."
  fix_tasks:
    - "3.F1 FIX — nudge/NudgeClient.tsx:321 must use `encodeURIComponent(person.studentEmail)` in href. Add regression test with email containing `+` to verify pre-filtering works."
    - "3.F2 FIX — Add test case to NudgeClient.test.tsx or StudentsClient.interactions.test.tsx covering email with special char (e.g. user+tag@example.com) to prevent regression."

- group: 3
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "Spec: All 3 SHALL requirements met. DetailPanel shows recent 5 DESC (StudentsClient filters/sorts/slices). Empty state 'still text present. nudge→interactions link uses encodeURIComponent. Contract requirements 100% satisfied."
    - "Runtime: All 37 tests pass. Coverage complete—DetailPanel.interactions.test.tsx tests rendering + empty state; StudentsClient.interactions.test.tsx tests 5-item filtering; NudgeClient.test.tsx tests both regular email and +special-char encoding."
    - "Code: APPROVE—0 CRITICAL, 0 HIGH. Attempt 1's HIGH (missing encodeURIComponent) is FIXED: line 106 uses encodeURIComponent(person.studentEmail). Format function migration (formatAt/channelLabel) is clean. Data flow matches design.md decisions (4, 5). No security/typing issues."
