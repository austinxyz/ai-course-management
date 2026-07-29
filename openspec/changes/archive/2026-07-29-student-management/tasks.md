## 1. 后端脚手架 + DB schema

### Contract
- **Spec**: 学员表的邮箱列 SHALL 有唯一约束；系统 SHALL 拒绝重复邮箱的写入（约束在 schema 层生效，即便本 change 未开放写接口）。
- **Runtime**: `cd backend && pytest` → expected: 新增的唯一性测试通过，无 import/连接错误
- **Code**: design.md 决策 #1（邮箱作为字面主键，不设代理 id）、#2（TEXT 列 + Pydantic Literal，不用 DB CHECK 约束）、#3（NOT NULL DEFAULT，不用 NULL）
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/student-management/contracts/group-1.md with the ### Contract block above
- [x] 1.1 RED — pytest：向 `students` 表插入邮箱重复的两行，断言第二次插入抛 `IntegrityError`（此时表还不存在，测试应先失败于"表不存在"或断言失败）
- [x] 1.2 GREEN — `uv init backend/`，建 `backend/app/{main.py,db.py,models.py}`；新增 `supabase/migrations/<timestamp>_create_students_table.sql`（`email TEXT PRIMARY KEY`、`name/wechat/wx_name/nick/region/level/source/note/gender/age/industry TEXT NOT NULL DEFAULT` 对应默认值、`tags JSONB NOT NULL DEFAULT '[]'`）；`supabase start` 后跑 migration，1.1 测试转绿
- [x] 1.3 新增 `supabase/seed.sql`，写入 `frontend/app/students/mock-data.ts` 里那 10 条虚构学员（字段一一对应）；`supabase db reset` 验证 migration + seed 组合能从空库跑出预期状态（人工检查，非自动化测试——数据填充不是可测试的代码行为）
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. FastAPI 只读端点

### Contract
- **Spec**: 系统 SHALL 通过 `GET /api/students` 返回全部学员记录，字段覆盖姓名/邮箱/微信号/微信昵称/区域/基础/来源/标签/备注；空库返回空数组而非报错。系统 SHALL 通过 `GET /api/students/{email}` 返回该邮箱对应的学员完整记录（大小写不敏感匹配）；邮箱不存在时 SHALL 返回 404。未采集微信号的学员，API SHALL 返回空字符串 `""`。
- **Runtime**: `cd backend && pytest` → expected: 全部新增测试通过，覆盖列表/详情/空库/404/大小写匹配五种场景
- **Code**: design.md 决策 #4（`tz` 不入库，按 `region` 动态算）、#8（邮箱查询用 `lower()` 比较，不引入 citext）
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/student-management/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — pytest：`GET /api/students`（种子数据已加载）断言 200 + 数组长度 10 + 每条记录含全部字段；另断言微信号为空的记录 `wechat == ""`
- [x] 2.2 GREEN — 实现 `backend/app/routers/students.py` 的列表端点、`backend/app/main.py` 挂载路由
- [x] 2.3 RED — pytest：`GET /api/students/{email}`（大小写混合的邮箱）断言 200 + 完整字段；不存在的邮箱断言 404；额外一条：清空表后 `GET /api/students` 断言 200 + `[]`（不是 500/404）（这三条与 2.1 一起写在 test_students_api.py，同一批 RED/GREEN 验证）
- [x] 2.4 GREEN — 实现详情端点（`lower(email) = lower(:param)` 匹配）、空库路径
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端接线（Server Component + 真实数据）

### Contract
- **Spec**: 学员列表页由真实数据驱动（浏览器 → Next.js server-side fetch → FastAPI → 本地 Supabase）；点击列表行，详情面板显示该学员完整字段（只读）。
- **Runtime**: `cd frontend && npm run test` → expected: 新增 vitest 用例通过，`StudentsClient` 渲染的未对齐微信徽章类名命中 design token
- **Code**: design.md 决策 #7（Server Component 外壳 + Client Component 内核拆分，`frontend/lib/api.ts` 是 server-only 模块，不带 `NEXT_PUBLIC_` 前缀）
- **Threshold**: 70

- [x] 3.0 CONTRACT — write openspec/changes/student-management/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — vitest：`frontend/lib/api.ts` 的 `getStudents()` 用 mock `fetch` 断言请求 URL 含 `process.env.BACKEND_URL` + `/api/students`，返回值类型匹配 `Student[]`
- [x] 3.2 GREEN — 实现 `frontend/lib/api.ts`（`getStudents()`、`getStudent(email)`，server-only 约定（未用 `server-only` 包——它在 vitest 下无条件报错，改用注释约定），读 `BACKEND_URL`）
- [x] 3.3 MOCK — open docs/superpowers/specs/mocks/2026-07-28-student-management-mocks.html#student-list-desktop；记录 token（`.badge-danger` 对应 `bg-danger`/`text-danger-foreground` 用于"未对齐微信"、`.btn-primary` 对应 `bg-primary`）与逐字文案（"学员"、"邮箱为唯一标识；微信号用于催作业，需人工对齐。"）。既有实现（`StudentsTable.tsx`）已经用 `Badge variant="danger"` 渲染未对齐徽章，与 mock token 一致，无需改动
- [x] 3.4 RED — vitest：把 `frontend/app/students/page.tsx` 的既有交互逻辑抽到 `StudentsClient.tsx` 后，传入一条 `wechat: ""` 的学员 prop，断言渲染出的徽章 `wrapper.classes()` 命中 `/bg-danger/`（token-locked，不只测 `data-*` 选择器）
- [x] 3.5 GREEN — 把现有 `page.tsx` 内容原样搬进 `StudentsClient.tsx`（`"use client"`），`page.tsx` 改为 async Server Component：调用 `getStudents()`，把结果传给 `<StudentsClient students={...} />`，删除对 `mock-data.ts` 里 `DATA` 常量的导入（`NAV`/`PAGES`/枚举列表等静态数据仍可保留使用）。额外清理了 `mock-data.ts` 里同样死掉的 `DATA`/`INITIAL_ARCHIVED` 导出，并补上 vitest（这个项目之前没配置）+ `@` path alias
- [x] 3.6 VISUAL DIFF — 用 `npm run dev --prefix frontend`（`openspec/config.yaml` 的 `dev_stack_command`）起本地栈，浏览器打开 `/students`，跟 mock 逐项对比：未对齐微信徽章颜色、按钮主色、列表字段是否跟种子数据一致；有偏差就地修。实测：真实 FastAPI + 本地 Supabase 数据渲染正确，10 条种子学员、3 条未对齐微信，字段与颜色跟之前的 mock 版本一致，浏览器控制台无报错
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证 + 收尾

- [x] 4.1 Run backend test suite — `cd backend && pytest`，确认无回归（5/5 通过）
- [x] 4.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归（2/2 通过）
- [x] 4.3 e2e — `openspec/config.yaml` 的 `e2e_command` 为空，本 change 跳过（无 e2e 框架）
- [x] 4.4 Run superpowers:verification-before-completion — 跑 `project.test_commands`（backend 5/5、frontend 2/2 全过）；`grep -rn 'console.log' frontend/app frontend/lib`（无匹配）；跑 `project.custom_verification_checks`（无密钥/环境变量泄露）；额外跑了 `npm run build` 确认生产构建过（`/students` 正确标记为 dynamic route）
