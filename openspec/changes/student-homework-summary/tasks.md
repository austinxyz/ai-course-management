## 1. 后端：报课查询带出作业总分

### Contract
- **Spec**: `GET /api/enrollments` 的每一条记录 SHALL 附带该学员在这门课的作业提交总分（`homework_total`），没有提交记录时该字段 SHALL 为 `null`。该字段 SHALL 在既有的一条 JOIN 语句里取得，SHALL NOT 增加应用层的数据库往返次数。同一学员对同一门课有多条报课记录时，各条记录的 `homework_total` SHALL 相同。（`specs/enrollment/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_enrollments_api.py` → expected: 全部通过，新增用例覆盖有提交/无提交/重复报名三种情形，无既有用例回归
- **Code**: `list_enrollments` 的 `select()` 加一个 `HomeworkSubmission` 的 outerjoin（`(student_email, course_id)` 唯一键，1:1 安全无笛卡尔积，与 `homework.py::list_homework` 已验证过的同款 JOIN 模式一致）；`_to_read` 签名加 `submission: HomeworkSubmission | None` 参数；`EnrollmentRead` 新增 `homework_total: int | None`；不新增 `session.exec` 调用
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/student-homework-summary/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — `backend/tests/test_enrollments_api.py`：新增用例，某学员某门课有一条 `HomeworkSubmission`（`total=77`），断言 `GET /api/enrollments?student=` 返回的对应记录 `homework_total == 77`；此时字段不存在，响应体里没有这个 key，断言应失败
- [ ] 1.2 GREEN — `backend/app/schemas.py` 给 `EnrollmentRead` 加 `homework_total: int | None = None`；`backend/app/routers/enrollments.py` 的 `list_enrollments` 查询加 outerjoin，`_to_read` 补参数并传入
- [ ] 1.3 RED — 新增用例：某学员某门课没有 `HomeworkSubmission`，断言该记录 `homework_total is None`
- [ ] 1.4 GREEN — 确认 outerjoin 的 `None` 分支已经正确处理（多数情况下 1.2 已经覆盖，这一步只是补测试，不需要额外代码）
- [ ] 1.5 RED — 新增用例：某学员对同一门课有两条报课记录（重复报名），这门课有一条提交，断言两条报课记录返回的 `homework_total` 相同且等于提交总分
- [ ] 1.6 GREEN — 如 1.5 测试失败才需要改动；预期 outerjoin 天然满足，此步用于确认
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：学员详情页报课记录卡片显示作业概要

### Contract
- **Spec**: 学员详情页「报课记录」每一行 SHALL 显示该门课的作业情况：有提交记录显示「已交 · N 分」，没有显示「未交」；该行 SHALL 可点击，跳转到 `/homework?course=<courseId>&student=<email>`。（`specs/enrollment/spec.md` 的 `homework_total` 字段是这块 UI 的数据来源；UI 行为本身记在 `docs/superpowers/specs/2026-08-03-student-homework-summary-requirements.md` 的 "UI Description" 一节）
- **Runtime**: `cd frontend && npm run test -- EnrollmentRows` → expected: 全部通过，新增用例覆盖已交/未交两种展示与跳转链接的 href，无既有用例回归
- **Code**: `frontend/app/(app)/students/types.ts` 的 `Enrollment` 加 `homeworkTotal: number | null`；`frontend/lib/api.ts` 的报课映射函数加一行蛇形→驼峰；`EnrollmentRow`（`EnrollmentRows.tsx`）新增一行，复用现有 `font-mono text-[11px] text-muted-foreground` 规格（跟场次/报名日期同一套），「已交」态用 `text-primary` 链接色，「未交」态 `text-muted-foreground`，两者都是 `<a href>` 不是按钮；不新增视觉 token
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/student-homework-summary/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — `frontend/app/(app)/students/EnrollmentRows.test.tsx`：新增用例，`homeworkTotal: 77` 的报课记录渲染出「已交 · 77 分」文字，且对应 `<a>` 的 `href` 是 `/homework?course=<courseId>&student=<email>`（`email` 需 `encodeURIComponent`）
- [ ] 2.2 GREEN — `types.ts` 加字段；`api.ts` 加映射；`EnrollmentRow` 加渲染
- [ ] 2.3 RED — 新增用例：`homeworkTotal: null` 的报课记录渲染出「未交」文字，`href` 与上面一致
- [ ] 2.4 GREEN — 补上 `null` 分支渲染（多数情况下 2.2 已经覆盖，这一步用于确认）
- [ ] 2.5 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开学员详情页，核对新增的「作业」行位置、字号、颜色与 `docs/superpowers/specs/2026-08-03-student-homework-summary-requirements.md` 的 "UI Description" 一节描述一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：/homework 页支持深链接自动选中学员

### Contract
- **Spec**: `/homework` 页 SHALL 接受 `student` query 参数（学员邮箱）。存在该参数且该邮箱在当前课程名单里时，页面加载时 SHALL 自动展开该学员的详情面板。参数缺失或指向的邮箱不在当前课程名单里时，SHALL 保持原有行为（不自动选中任何人）。（`specs/homework/spec.md`）
- **Runtime**: `cd frontend && npm run test -- HomeworkClient page` → expected: 全部通过，新增用例覆盖带参数且命中/带参数但不命中/不带参数三种情形，无既有用例回归
- **Code**: `frontend/app/(app)/homework/page.tsx` 的 `searchParams` 类型加 `student?: string`，读出后作为新 prop 传给 `HomeworkClient`；`HomeworkClient` 的 `selected` 状态初始值从该 prop 取（默认 `null`），不做服务端或客户端校验——`rows.find(...)` 找不到时天然不展开，不需要额外的"不存在"分支
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/student-homework-summary/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — `frontend/app/(app)/homework/HomeworkClient.test.tsx`：新增用例，传入 `initialSelectedEmail="alpha@example.com"`（存在于 `people` 里）时，详情面板渲染时已经展开（不需要用户点击）；此时组件不接受这个 prop，测试应失败（TS 报错或 prop 被忽略、详情面板不展开）
- [ ] 3.2 GREEN — `HomeworkClient` 加 `initialSelectedEmail?: string | null` prop，`selected` 的 `useState` 初始值改为它
- [ ] 3.3 RED — 新增用例：`initialSelectedEmail` 指向的邮箱不在 `people` 里，断言详情面板不展开、不报错
- [ ] 3.4 GREEN — 确认现有 `rows.find(...)` 逻辑已经满足（多数情况下 3.2 已经覆盖，这一步用于确认）
- [ ] 3.5 RED — `frontend/app/(app)/homework/page.test.tsx`：新增用例，`searchParams` 带 `student=alpha@example.com` 时，`HomeworkClient` 收到的 `initialSelectedEmail` prop 等于该值；不带时为 `null`
- [ ] 3.6 GREEN — `page.tsx` 读取 `searchParams.student` 并传入
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证与收尾

- [ ] 4.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [ ] 4.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [ ] 4.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [ ] 4.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
