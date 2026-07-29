# Eval Log — access-control

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 4 SHALL statements fully implemented (secret validation, rejection of missing/wrong secrets, docs disabled by default, fail-closed on missing env var)"
    - "spec: All 5 design decisions correctly realized (middleware-based, constant-time compare, fail-closed via separate checks, explicit docs opt-in, no env detection)"
    - "runtime: All 6 tests pass, covering 5 required scenarios (no secret→401, wrong secret→401, correct secret→200, missing env var→401, docs default-off)"
    - "code: 0 CRITICAL/HIGH issues from security review; fail-closed design properly implemented (separate checks not folded); secrets.compare_digest used for constant-time comparison; no hardcoded secrets or logging; middleware placement ensures new routes protected by default"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All 10 SHALL statements and design decisions verified (proxy.ts naming, fail-closed check, WWW-Authenticate header, matcher excludes static assets, secret stays server-side, no env branches)"
    - "runtime: All 16 tests pass including the 5 required scenarios (no credentials→401, wrong credentials→401, correct credentials→200, missing password var→401, 401 has WWW-Authenticate header)"
    - "code: 0 CRITICAL/HIGH issues; code-reviewer approved. 3 LOW findings noted: (1) password comparison uses !== instead of constant-time (acceptable for low-value internal tool), (2) redundant NextResponse type cast (optional polish), (3) matcher doesn't exclude /api/* (only affects future API route handlers)"
    - "security: BACKEND_SECRET properly read from non-NEXT_PUBLIC_ env var and injected server-side; no secret leakage to browser; Base64 decode wrapped in try/catch; colon-splitting uses indexOf (first colon only) to preserve passwords with colons"

- group: 3
  attempt: 1
  scores: {spec: 90, runtime: 100, code: 85}
  total: 93
  status: PASS
  findings:
    - "spec: Design decision #6 correctly implemented: (1) two distinct variables SITE_PASSWORD vs BACKEND_SECRET documented with different purposes; (2) BACKEND_SECRET explicitly marked server-side only with warning against NEXT_PUBLIC_ prefix; (3) leak scan pattern widened from NEXT_PUBLIC_(DATABASE|SUPABASE|SMTP) to include BACKEND|SITE_PASSWORD|API, verified to catch both NEXT_PUBLIC_BACKEND_SECRET and NEXT_PUBLIC_SITE_PASSWORD via live grep test. File-type filters added (--include=*.ts *.tsx *.js *.jsx) restricts scope intentionally."
    - "runtime: All frontend tests pass (5 files, 16 tests), all backend tests pass (17 tests). No regressions introduced by .env.example changes (templates only, no code changes)."
    - "code: 0 CRITICAL/HIGH issues. Code reviewer APPROVED. One MEDIUM finding: ENABLE_API_DOCS=1 is enabled in backend/.env.example when it should be commented out to match the fail-closed philosophy (default off, explicit opt-in) applied to other variables in same file. One LOW finding: file-type filter narrowing applies to pre-existing patterns too, likely intentional. No real credentials in either .env.example file — both use clearly-fake placeholders (local-dev-secret-not-a-real-one)."
    - "security: Both frontend and backend .env.example verified to contain only placeholder values. .env.local and .env are properly gitignored. Cross-reference verified: backend/app/auth.py enforce fail-closed 401 when BACKEND_SECRET unset; backend/app/main.py gates /docs and /openapi.json on ENABLE_API_DOCS toggle; frontend/lib/api.ts reads BACKEND_SECRET server-side only (not NEXT_PUBLIC_)."
  fix_tasks: []
