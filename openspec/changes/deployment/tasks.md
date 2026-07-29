## 1. 连接串兼容性（后端）

### Contract
- **Spec**: 后端 SHALL 接受 Supabase 控制台格式的数据库连接串（`postgresql://` 前缀）并以 psycopg v3 驱动建立连接，不得因驱动解析而在启动时崩溃。
- **Runtime**: `cd backend && uv run pytest tests/test_db_url.py -v` → expected: 全部用例通过，覆盖 `postgresql://`、`postgres://`、已带 `+psycopg` 三种输入
- **Code**: design.md 决策 #1 —— 归一化写在 `db.py` 内部而非依赖人工填对格式；已带 `+psycopg` 的串必须原样透传，不得重复改写；归一化只影响驱动选择，不得改动主机/库/凭证任何一项
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/deployment/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — pytest：新建 `tests/test_db_url.py`，断言归一化函数把 `postgresql://u:p@h:5432/db` 转成 `postgresql+psycopg://u:p@h:5432/db`（函数尚不存在，应失败于 ImportError）
- [ ] 1.2 GREEN — 在 `backend/app/db.py` 实现归一化并在构造 engine 前调用
- [ ] 1.3 RED — pytest：补三条边界断言——`postgres://` 前缀同样被归一化；已带 `postgresql+psycopg://` 的串原样返回（不被二次改写）；用户名/密码/主机/端口/库名在归一化前后逐项相等
- [ ] 1.4 GREEN — 补齐实现使 1.3 转绿
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 错误态与加载态（前端）

### Contract
- **Spec**: 学员名单页 SHALL 在后端不可达时呈现可读的错误说明与重试入口，而非白屏或未捕获的异常。错误说明 SHALL 同时覆盖"服务正在唤醒"与"服务异常"两种可能——前端无法区分二者，不得断言其一。学员名单页 SHALL 在数据获取期间呈现加载态，且该加载态 SHALL 明示可能出现的长时间等待，避免用户将正常的冷启动等待误判为页面卡死而反复刷新。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 用例通过，含错误态渲染+重试回调、加载态文案、fetch 超时三组新增断言
- **Code**: design.md 决策 #2（fetch 必须带显式超时且短于 Vercel 函数上限，否则函数被平台掐死、`error.tsx` 根本没机会渲染——这是本组存在的意义）、决策 #5（按全屏居中卡片实现，不为保留侧边栏而重构布局）；复用既有 token 与 `Card`/`Button`，不引入新视觉语言
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/deployment/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-07-29-deployment-mocks.html#error-desktop 与 #loading-desktop；记录 token（重试按钮 `bg-primary`、错误图标底 `bg-danger-surface` + `border-danger-border`、加载图标底 `bg-surface-muted`）与逐字文案（"暂时无法加载学员数据"、"重试"、"正在加载学员数据…"、以及加载态里关于"约需 1 分钟"的说明）
- [ ] 2.2 RED — vitest：`frontend/lib/api.test.ts` 补一条——mock 一个永不 resolve 的 fetch，断言 `getStudents()` 在超时后抛错（而非无限挂起）；此时尚无超时实现，应失败
- [ ] 2.3 GREEN — 在 `frontend/lib/api.ts` 的 `getStudents()` / `getStudent()` 加 `AbortSignal.timeout(...)`，超时值取明显小于 Vercel 函数上限的数（apply 时结合实测上限敲定）
- [ ] 2.4 RED — vitest：新建 `frontend/app/students/error.test.tsx`，渲染 `<Error error={new Error()} reset={vi.fn()} />`，断言出现 mock 定稿的标题文案、断言重试按钮 `className` 命中 `/bg-primary/`（token-locked）、点击后 `reset` 被调用；组件尚不存在，应失败
- [ ] 2.5 GREEN — 实现 `frontend/app/students/error.tsx`（`"use client"`，接收 `{ error, reset }`），按 mock 的居中卡片结构，复用 `Card` / `Button`
- [ ] 2.6 RED — vitest：新建 `frontend/app/students/loading.test.tsx`，断言加载态文案包含对等待时长的说明（不能只有"加载中"）；组件尚不存在，应失败
- [ ] 2.7 GREEN — 实现 `frontend/app/students/loading.tsx`
- [ ] 2.8 VISUAL DIFF — 用 `npm run dev --prefix frontend`（`openspec/config.yaml` 的 `dev_stack_command`）起前端；**在后端未启动的情况下**访问 `/students` 触发真实错误态；与 mock 逐项比对配色、文案、按钮样式；修正偏差
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 部署配置与 CI（仓库内产物）

### Contract
- **Spec**: N/A —— 基础设施组。本组产出的是部署配置与 CI workflow，不构成对外行为契约，`student-roster` 的 SHALL 由第 1、2 组覆盖。
- **Runtime**: `cd backend && uv run python -c "import yaml; yaml.safe_load(open('../render.yaml')); yaml.safe_load(open('../.github/workflows/db-migrate.yml')); print('yaml ok')"` → expected: 两个 YAML 均能解析，输出 `yaml ok`
- **Code**: design.md 决策 #3（`render.yaml` 走 Blueprint，start 命令必须用 `$PORT` 与 `--host 0.0.0.0`，否则平台健康检查连不上）、决策 #4（Actions 每次 push main 都跑，**不加 `paths` 过滤**——过滤写错的失败模式正是本 change 要消灭的"migration 静默不部署"）、决策 #7（`.env.example` 前后端各一份）
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/deployment/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 新建 `render.yaml`：Root Directory `backend`，Build `pip install uv && uv sync --frozen --no-dev`，Start `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`，plan free，`DATABASE_URL` 声明为需在控制台填入的 secret（不写值）
- [ ] 3.2 新建 `.github/workflows/db-migrate.yml`：触发条件 `push` 到 `main`（无 paths 过滤）；步骤为 checkout → `supabase/setup-cli` → `supabase link --project-ref` → `supabase db push`；三个 secret 从 `secrets.*` 读取，**不得硬编码任何凭证**
- [ ] 3.3 新建 `backend/.env.example`（`DATABASE_URL`，注明本地值与生产取自 Supabase pooler）与 `frontend/.env.example`（`BACKEND_URL`，注明 server-side only、禁止 `NEXT_PUBLIC_` 前缀）；两份都只放占位值，不放真实凭证
- [ ] 3.4 跑 Contract 里的 YAML 解析检查，确认两个配置文件语法有效
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 平台部署与验收

<!-- No Contract/EVAL block for this group — verification-and-ship group runs cross-cutting checks, not per-feature harness evaluation -->

**含 manual-ops：** 4.1–4.5 涉及账号注册、控制台操作与凭证录入，必须由用户本人执行；agent 负责给出清单、待用户完成后接手验证。

- [ ] 4.1 **[人工]** 建 Supabase 云项目，取 **pooler / session 模式（5432）** 连接串（design 决策 #6）
- [ ] 4.2 首次 `supabase link --project-ref <ref>` + `supabase db push`，在云端建表；确认 `students` 表存在且为空（`seed.sql` 不应被推送）
- [ ] 4.3 **[人工]** 配 GitHub Secrets：`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF`
- [ ] 4.4 **[人工]** Render 建 Web Service（依 `render.yaml`），填入 4.1 的连接串；记录分配到的服务 URL
- [ ] 4.5 **[人工]** Vercel 建 Project，Root Directory 指向 `frontend`，配 `BACKEND_URL` = 4.4 的 URL
- [ ] 4.6 验收 —— `curl <render-url>/api/students` 返回 `200` + `[]`（证明后端真连上云库；连不上会 500，空库与连不上由此区分）
- [ ] 4.7 验收 —— `curl <render-url>/api/students/nobody@example.com` 返回 `404`
- [ ] 4.8 验收 —— 打开 Vercel 上的 `/students`，渲染"暂无学员"空状态，浏览器控制台无报错
- [ ] 4.9 验收 —— **实测冷启动路径**：等待 Render 休眠（或人为使后端不可达）后访问页面，确认看到的是本 change 实现的错误卡片，**而非 Vercel 平台的 504 页**（design 决策 #2 的核心风险，必须实际验证而非推断）
- [ ] 4.10 验收 —— 推一个空提交到 `main`，确认 GitHub Actions 的 `db push` job 成功
- [ ] 4.11 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 4.12 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 4.13 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑 `project.custom_verification_checks`（含密钥/环境变量泄露检查）；另需确认 `.env.example` 与 `render.yaml` 中均无真实凭证
