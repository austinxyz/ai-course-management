## 1. 后端：secret 校验 + 关闭 API 文档

### Contract
- **Spec**: 后端 SHALL 校验共享 secret header，默认覆盖所有路由；未携带或携带错误 secret 的请求 SHALL 被拒绝。后端在生产环境 SHALL NOT 提供 `/docs` 与 `/openapi.json`。当认证所需的环境变量缺失时，系统 SHALL 拒绝全部请求，SHALL NOT 放行。
- **Runtime**: `cd backend && uv run pytest tests/test_access_control.py -v` → expected: 全部通过，覆盖 无 secret→401、错 secret→401、对 secret→200、secret 变量缺失→拒绝、docs 默认关闭 五种情形
- **Code**: design.md 决策 #4（校验放 FastAPI middleware 而非 router 依赖——新增路由自动受保护；用 `secrets.compare_digest` 常数时间比较）、决策 #5（文档开关做成"默认关、显式开"，靠 `ENABLE_API_DOCS` 显式启用，而不是判断"是否生产"）、决策 #3 的 fail-closed 形状（先判缺失、再比对，不可合并成一个条件表达式）
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/access-control/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — pytest：新建 `tests/test_access_control.py`，用 TestClient 断言不带 secret header 的 `GET /api/students` 返回 401（当前无校验，应失败于返回 200）
- [ ] 1.2 GREEN — 在 `backend/app/` 实现 secret 校验 middleware 并挂到 app 上；比对用 `secrets.compare_digest`
- [ ] 1.3 RED — pytest：补三条——携带**错误** secret → 401；携带**正确** secret → 200；**secret 环境变量缺失**时任意请求 → 被拒（这条锁死 fail-closed 方向，是本组最重要的断言）
- [ ] 1.4 GREEN — 补齐实现使 1.3 转绿；确保"变量缺失"与"值不符"是两条独立判断，不合并成单个条件表达式
- [ ] 1.5 RED — pytest：断言未设 `ENABLE_API_DOCS` 时 `/docs` 与 `/openapi.json` 返回 404（当前恒为 200，应失败）
- [ ] 1.6 GREEN — `backend/app/main.py` 改为默认 `docs_url=None, openapi_url=None`，仅当显式设了 `ENABLE_API_DOCS` 才开启
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：整站 Basic Auth + 注入 secret

### Contract
- **Spec**: 系统 SHALL 对未携带有效凭据的请求拒绝访问全部页面路由，并且响应体 SHALL NOT 含有任何学员数据；拒绝必须发生在渲染之前。当认证所需的环境变量缺失时，系统 SHALL 拒绝全部请求。认证逻辑 SHALL NOT 包含任何环境判断分支——本地与生产运行同一条代码路径。该 secret SHALL 仅存在于服务端，不得以任何形式出现在浏览器可见的内容中。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 通过，含 无凭据→401、错凭据→401、对凭据→放行、密码变量缺失→拒绝、401 响应带 `WWW-Authenticate` 头 五组断言
- **Code**: design.md 决策 #1（文件必须是根目录 `proxy.ts` 而非 `middleware.ts`——本版已弃用改名；写错的失败形状是"文件根本不执行、页面照常打开"，与认证生效外观相同）、决策 #2（matcher 用负向匹配排除 `_next/static` 等，否则会拦掉 CSS/JS）、决策 #3（fail-closed：先判缺失再比对）、决策 #7（401 必须带 `WWW-Authenticate: Basic realm="..."`，否则浏览器不弹凭据框）
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/access-control/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — vitest：新建 `frontend/proxy.test.ts`，构造无 `Authorization` 头的 `NextRequest` 调用 `proxy()`，断言返回 401 且带 `WWW-Authenticate` 头（函数尚不存在，应失败）
- [ ] 2.2 GREEN — 新建 `frontend/proxy.ts`（根目录，与 `app/` 同级），实现 Basic Auth 校验与 401 响应
- [ ] 2.3 RED — vitest：补三条——凭据**错误** → 401；凭据**正确** → 放行（`NextResponse.next()`）；**密码环境变量缺失** → 拒绝（fail-closed，本组最重要的断言）
- [ ] 2.4 GREEN — 补齐实现；"变量缺失"与"值不符"必须是两条独立判断
- [ ] 2.5 GREEN — 配置 `proxy.ts` 的 `config.matcher`，用负向模式排除 `_next/static`、`_next/image`、`favicon.ico`
- [ ] 2.6 RED — vitest：`frontend/lib/api.test.ts` 补一条，断言 `getStudents()` 发出的请求头里带上了后端 secret（当前未注入，应失败）
- [ ] 2.7 GREEN — `frontend/lib/api.ts` 在 `getStudents()` / `getStudent()` 注入 secret header
- [ ] 2.8 验证 proxy 真的被执行 —— 起本地栈（`openspec/config.yaml` 的 `dev_stack_command`），不带凭据访问 `/students` 确认得到 401 而非页面。**这一步不可省**：`proxy.ts` 命名或位置写错时文件根本不会执行，症状是"页面照常打开"，与认证生效无法区分（design 决策 #1 的核心风险）
- [ ] 2.9 验证不泄露数据 —— 本地带 seed 数据的情况下，未授权请求的响应体中不得出现任何种子学员的姓名/邮箱/微信号（生产库为空，该断言只能在本地有效验证——design Risks 已说明）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 配置与泄露检查

### Contract
- **Spec**: N/A —— 基础设施组。本组产出的是环境变量模板与仓库级检查项，不构成对外行为契约；`access-control` 的 SHALL 由第 1、2 组覆盖。
- **Runtime**: `cd frontend && npm run test && cd ../backend && uv run pytest` → expected: 前后端测试均无回归（本组只改模板与配置，不应影响任何测试）
- **Code**: design.md 决策 #6 —— 前端密码与后端 secret 是两个不同变量；后端 secret 绝不可带 `NEXT_PUBLIC_` 前缀；`openspec/config.yaml` 现有泄露检查覆盖不到新变量名，必须扩充，否则误写成 `NEXT_PUBLIC_*` 时现有检查不会报警
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/access-control/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 `frontend/.env.example` 新增共享密码与后端 secret 两个变量，注明 server-side only、禁止 `NEXT_PUBLIC_` 前缀、以及缺失时会 fail-closed（进不去而非放行）
- [ ] 3.2 `backend/.env.example` 新增后端 secret 与 `ENABLE_API_DOCS`，注明后者是"默认关、显式开"，生产不要设
- [ ] 3.3 扩充 `openspec/config.yaml` 的 `custom_verification_checks`，把新增的认证变量名纳入 `NEXT_PUBLIC_` 泄露扫描
- [ ] 3.4 跑一遍扩充后的检查命令，确认它对当前代码通过（无误报），并确认它**能**捕获人为构造的 `NEXT_PUBLIC_` 泄露（否则等于没加）
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 部署与验收

<!-- No Contract/EVAL block for this group — verification-and-ship group runs cross-cutting checks, not per-feature harness evaluation -->

**含 manual-ops：** 4.1–4.2 需在 Vercel / Render 控制台录入环境变量，必须由用户本人执行。
**顺序要紧：** 必须先配好平台变量再让代码生效，否则 fail-closed 会把人锁在外面（见 design Migration Plan）。

- [ ] 4.1 **[人工]** Vercel 配前端共享密码变量；Render 配后端 secret 变量（两个不同的值）
- [ ] 4.2 **[人工]** 本地 `.env` / `.env.local` 补上对应变量（本地与生产行为一致，不配则进不去）
- [ ] 4.3 部署后验收 —— 未带凭据访问生产 `/students` 返回 401，**且响应体不含学员数据**
- [ ] 4.4 部署后验收 —— 未带凭据访问生产 `/` 与 `/style-guide` 同样返回 401（保护范围是整站）
- [ ] 4.5 部署后验收 —— 带正确凭据访问 `/students`，页面行为与本 change 之前一致
- [ ] 4.6 部署后验收 —— 不带 secret 直接 `curl` 生产后端 `/api/students` → 401（而非 200）
- [ ] 4.7 部署后验收 —— 生产 `/docs` 与 `/openapi.json` → 404
- [ ] 4.8 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 4.9 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 4.10 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑扩充后的 `project.custom_verification_checks`；另需确认 `.env.example` 与仓库内任何文件均无真实密码/secret
