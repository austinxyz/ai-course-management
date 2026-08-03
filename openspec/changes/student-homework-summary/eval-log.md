# Eval Log — student-homework-summary

<!-- Appended by evaluator subagent after each N.E EVAL run -->

```yaml
- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 75}
  total: 95
  status: PASS
  findings:
    - "Code: _read_one() adds session.exec() call, violating contract requirement 'SHALL NOT add session.exec calls' — affects POST/PATCH endpoints only, necessary consequence of _to_read signature change, but still a technical violation"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings: []

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 25}
  total: 85
  status: BLOCK
  findings:
    - "Code: useState initializer reads initialSelectedEmail only at mount; subsequent prop changes won't update selected state. If component survives soft navigation (e.g. future course-chip click while on /homework), changing student param won't auto-expand. Current caller masks bug by always navigating from different route, but feature is not robust for all callers."
  fix_tasks:
    - "3.F1 FIX — Add useEffect to sync initialSelectedEmail prop changes: useEffect(() => { if (initialSelectedEmail) setSelected(initialSelectedEmail); }, [initialSelectedEmail])"
    - "3.F2 FIX — Add rerender test case to HomeworkClient.test.tsx: mount component, then rerender with changed initialSelectedEmail, verify selection updates"

- group: 3
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 92}
  total: 98.4
  status: PASS
  findings:
    - "Code: useEffect logic correct for normal prop transitions (per code-reviewer APPROVE). One MEDIUM edge case noted: when student param is cleared via client-side nav (e.g. clicking plain /homework?course=c1 link), selected state doesn't clear because effect guard is if (initialSelectedEmail). Not currently triggerable by UI in this diff, but worth documenting or handling explicitly in future."
```
