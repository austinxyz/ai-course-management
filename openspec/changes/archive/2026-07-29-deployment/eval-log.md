# Eval Log — deployment

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 85}
  total: 97
  status: PASS
  findings:
    - "Spec: All contract requirements met. Backend accepts postgresql:// and postgres:// formats, rewrites to postgresql+psycopg://, preserves already-pinned URLs, only changes scheme."
    - "Runtime: All 4 tests pass (100%). Test coverage includes Supabase format, legacy format, already-pinned format, and URL parts preservation."
    - "Code (MEDIUM): Default fallback string (db.py:28-32) not directly tested; relies on implicit pass-through via already-pinned check. No CRITICAL or HIGH issues."
    - "Code (LOW): No test for non-psycopg driver specs (e.g., +asyncpg); scheme matching is case-sensitive (unlikely to occur from Supabase)."
  recommendation: "APPROVE. Implementation correctly satisfies all design constraints and contract requirements. MEDIUM test-coverage gap noted but does not block — can be addressed in follow-up if needed."

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "Spec: Error boundary covers both backend wake-up and outage causes without asserting either; loading state sets 1-minute wait expectation and discourages refresh; fetch timeout at 15s applied to both getStudents/getStudent."
    - "Runtime: All 9 tests pass (100%). Coverage includes error boundary rendering, dual-cause neutrality, unstable_retry usage, loading state messaging, and fetch timeout assertion."
    - "Code (APPROVE): 0 CRITICAL or HIGH issues. unstable_retry correctly implements re-fetch semantics (verified against Next.js 16.2 docs); Button/Card components reuse existing tokens; no secrets, console.log, or type safety issues."
    - "Code (LOW): Timeout constant value (15_000ms) asserted as AbortSignal presence but not for exact milliseconds (low risk given inline documentation); error/loading components lack aria-live for screen reader announcements (accessibility nicety, not contract requirement)."
  recommendation: "APPROVE. Implementation fully satisfies contract requirements and design decisions #2 and #5. Error fallback and loading states are production-ready. No blocking issues."

- group: 3
  attempt: 1
  scores: {spec: 65, runtime: 100, code: 75}
  total: 81
  status: RETRY
  findings:
    - "Spec (HIGH): Design decision #8 violation — frontend/.env.example exists with correct content but is NOT staged for commit. The file is blocked by frontend/.gitignore line 34 (.env*) which lacks the !.env.example exception that exists in root .gitignore. Only backend/.env.example is staged; design #8 explicitly requires both."
    - "Spec (PASS): Design decision #3 — render.yaml correctly uses $PORT variable, --host 0.0.0.0, and build command matches spec exactly."
    - "Spec (PASS): Design decision #4 — Actions workflow correctly triggers on every push to main with no paths filter (by design), and properly uses GitHub Secrets for SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF."
    - "Runtime (PASS): YAML parsing test succeeds. Both render.yaml and db-migrate.yml parse without errors; output: 'yaml ok'."
    - "Code (PASS): No hardcoded secrets or credentials. DATABASE_URL in render.yaml uses sync: false (requires manual entry in Render console). GitHub Actions properly reference secrets via ${{ secrets.* }}. All sensitive values are placeholder-only in .env.example files."
    - "Code (MEDIUM): frontend/.gitignore exception missing — same pattern !.env.example that permits backend/.env.example to be committed must be added to frontend/.gitignore to unblock staged commit of frontend/.env.example."
  fix_tasks:
    - "3.F1 FIX — Add !.env.example exception to frontend/.gitignore line 34 (add new line after .env*)"
  recommendation: "RETRY. Total score 81 barely meets threshold, but critically: Design decision #8 is not fulfilled. frontend/.env.example must be added to staged commit. This requires fixing frontend/.gitignore to include !.env.example exception, then re-staging the file."

# 归档时补记（apply agent，非 evaluator）
#
# group 3 的 status 字段是 RETRY，但 evaluator 在其返回摘要里报的是 PASS
# （总分 81 ≥ 阈值 80）—— 它对同一次评估给出了两个不一致的结论：分数过线，
# 但它认为那条 HIGH finding 严重到应当重跑。
#
# 实际处理：该 finding 当场就修了 —— frontend/.gitignore 补上 `!.env.example`
# 例外（commit 86745a2），两份 .env.example 随后都确认进了暂存区。修复内容与
# fix_task "3.F1" 描述完全一致，只是没有作为编号任务登记，所以 tasks.md 里
# 找不到 3.F1 这一行。
#
# 即：substance 已闭环，记账方式有出入。此处如实标注，不改动 evaluator 原始输出。
