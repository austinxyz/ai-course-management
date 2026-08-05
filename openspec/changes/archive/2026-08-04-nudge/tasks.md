## 1. 后端：`nudge_events` 表 + 未交名单查询

### Contract
- **Spec**: 催作业名单 SHALL 只含 `homework` 能力判定为"未交"（missing）状态的学员，SHALL NOT 含"未开放"/"未定场次"。逾期天数 SHALL 以所报场次的上课日期为基准；同一学员同一门课多条未交报课记录 SHALL 只算一条，取最早场次日期。名单查询 SHALL 一次请求返回名单+统计+催促历史（`history` 数组，按时间倒序），SHALL NOT 逐人二次请求。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` → expected: 全部通过，覆盖未交判定复用/逾期天数计算/同人多条记录去重/一次查询取全（含空历史时的"还没催过"占位）
- **Code**: 新建 `backend/app/routers/nudge.py`，从 `app.routers.homework` 导入 `merge_states`/`state_of`/`MISSING`/`SUBMITTED` 复用状态判定（design.md 决定 1）；`nudge_events` 表 migration（design.md 决定 2，`event_type` 不建 CHECK 约束、给未来扩展留口子，仿 `homework.source` 的先例）；`GET /api/nudge?course=` 用 `json_agg` 子查询把 `history` 嵌进主查询（design.md 决定 3），不新增 `session.exec` 调用
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/nudge/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 写 migration `supabase/migrations/<timestamp>_create_nudge_events.sql`：建表（见 design.md 决定 2 的建表语句），本地跑 `supabase db reset` 验证无报错
- [x] 1.2 `backend/app/models.py` 加 `NudgeEvent` SQLModel（`id`/`student_email`/`course_id`/`event_type`/`channel`/`note`/`created_at`）
- [x] 1.3 RED — `backend/tests/test_nudge.py`（新文件）：某学员某课有报课、所报场次已上完 9 天、无提交记录，断言 `GET /api/nudge?course=<id>` 返回的名单里含该学员，`overdue_days == 9`；此时端点不存在，测试应 404 失败
- [x] 1.4 GREEN — 新建 `backend/app/routers/nudge.py`，实现 `GET /api/nudge?course=` 基础版：JOIN 报课/学员/场次/提交，用 `merge_states`/`state_of` 过滤出 missing 状态的人，算逾期天数；`backend/app/schemas.py` 加 `NudgePersonRead`；`backend/app/main.py` 挂载新路由
- [x] 1.5 RED — 新增用例：某学员该课场次未上完（`not_open`）或未定场次（`no_session`），断言不出现在 `GET /api/nudge` 的名单里
- [x] 1.6 GREEN — 确认状态过滤正确排除这两类（多数情况下 1.4 已经覆盖，这一步用于确认边界）
- [x] 1.7 RED — 新增用例：某学员对同一门课有两条报课记录都处于未交（不同场次），断言名单里该学员只出现一次，`overdue_days` 取两条记录里最早场次日期算出的天数
- [x] 1.8 GREEN — 按学员分组、取最早场次日期的聚合逻辑
- [x] 1.9 RED — 新增用例：某学员该课已交作业，断言不出现在名单里（即便他也报了这门课）
- [x] 1.10 GREEN — 确认 `SUBMITTED` 状态正确排除（多数情况下 1.4 已经覆盖，这一步用于确认）
- [x] 1.11 RED — 新增用例：某学员该课有两条历史 `nudge_events`（一条 nudged、一条更早的 nudged），断言 `GET /api/nudge` 返回的该学员 `history` 数组按时间倒序、长度为 2；另一学员没有任何事件，断言其 `history` 为空数组
- [x] 1.12 GREEN — 实现 `history` 的 `json_agg` 子查询嵌入主查询
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 后端：标记已催 / 跳过

### Contract
- **Spec**: 讲师标记已催 SHALL 写入一条 `nudge_events`（类型 `nudged`），SHALL NOT 把学员从名单移除；渠道 SHALL 按微信是否对齐自动判定，SHALL NOT 提供人工选择渠道的接口。跳过 SHALL 写入一条 `nudge_events`（类型 `skipped`）并让该（学员,课程）从后续查询的名单中被排除，SHALL NOT 修改 `homework_submissions`/`enrollments` 的既有数据。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` → expected: 全部通过，覆盖标记已催写入记录且不移除/渠道自动判定/跳过后从名单排除/跳过不改动其余表
- **Code**: `POST /api/nudge/events` 接收 `{student_email, course_id, event_type, note?}`；渠道在服务端算（查 `Student.wechat` 是否非空），不接受请求体传入渠道（design.md 决定 4）；跳过的过滤直接加在 1.4 的查询 `WHERE NOT EXISTS (... skipped ...)` 里，不是应用层二次过滤
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/nudge/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — 新增用例：`POST /api/nudge/events` 传 `event_type=nudged`，断言返回 201 且新增一条 `nudge_events` 记录，该学员仍出现在 `GET /api/nudge` 名单里且 `history` 多了一条
- [x] 2.2 GREEN — 实现 `POST /api/nudge/events` 的 `nudged` 分支
- [x] 2.3 RED — 新增用例：该学员微信已对齐时标记已催，断言记录的 `channel == "wechat"`；未对齐时 `channel == "email"`
- [x] 2.4 GREEN — 服务端查 `Student.wechat` 判定渠道
- [x] 2.5 RED — 新增用例：`POST /api/nudge/events` 传 `event_type=skipped`，断言该学员之后从 `GET /api/nudge` 名单里消失，但 `homework_submissions`/`enrollments` 对应记录字段不变
- [x] 2.6 GREEN — 实现 `skipped` 分支 + 名单查询里的排除条件
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：催作业页 · 名单 + 详情面板

### Contract
- **Spec**: `/nudge` 页 SHALL 按课程展示未交名单（姓名/微信/逾期天数/已催次数/上次催促时间），选中一人 SHALL 在详情面板展示自动生成的可编辑草稿（套姓名/课程/逾期天数）与催促历史（按时间倒序，无记录时显示"还没催过这个人"）。（`specs/nudge/spec.md`；UI 结构见 `docs/superpowers/specs/mocks/2026-08-03-nudge-mocks.html`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient nudge` → expected: 全部通过，覆盖名单渲染/课程切换/选中展开详情/草稿文本套值/催促历史展示与空态
- **Code**: 新建 `frontend/app/(app)/nudge/page.tsx`（替换现有占位页）与 `NudgeClient.tsx`；草稿在前端纯函数 `draftFor(person)` 现算，不新增后端模板端点（design.md 决定 5）；从 `frontend/app/(app)/placeholder-routes.test.tsx` 移除"催作业"这一条（不再是占位页，仿此前作业/报课页转正时的先例），保留"互动记录"那条
- **Threshold**: 70

- [x] 3.0 CONTRACT — write openspec/changes/nudge/contracts/group-3.md with the ### Contract block above
- [x] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-08-03-nudge-mocks.html#list-desktop 与 #detail-empty-history 与 #mobile；记录课程 tab 结构、表格列（姓名/微信/逾期/已催/上次催促/跳过）、详情面板结构（草稿 textarea、复制文案+标记已催按钮、催促历史区块）
- [x] 3.2 RED — `frontend/app/(app)/nudge/NudgeClient.test.tsx`（新文件）：给定名单 + 课程列表，渲染出课程 tab、表格行（姓名/逾期天数/已催次数）；此时组件不存在，测试应失败
- [x] 3.3 GREEN — `frontend/app/(app)/nudge/types.ts` 定义类型；`NudgeClient.tsx` 渲染课程 tab + 名单表格（参照 `HomeworkClient.tsx` 的课程 chip + 表格结构）
- [x] 3.4 RED — 新增用例：点击名单一行，详情面板展开，草稿文本含该学员姓名、课程名、逾期天数
- [x] 3.5 GREEN — 实现选中状态 + `draftFor()` 纯函数生成草稿
- [x] 3.6 RED — 新增用例：选中的学员 `history` 非空时按时间倒序渲染催促历史；`history` 为空时显示"还没催过这个人"
- [x] 3.7 GREEN — 实现催促历史区块与空态
- [x] 3.8 RED — 新增用例：微信未对齐的学员在表格里显示"未对齐微信"标记（复用学员页既有视觉语言）
- [x] 3.9 GREEN — 实现该标记
- [x] 3.10 `frontend/app/(app)/nudge/page.tsx` 替换占位页：Server Component 取课程列表 + 默认课程的名单（参照 `homework/page.tsx` 的 `pickCourse` 模式），传给 `NudgeClient`
- [x] 3.11 从 `frontend/app/(app)/placeholder-routes.test.tsx` 移除"催作业"这一条测试用例（`NudgePage` 不再是占位页），确认"互动记录"那条保留且仍通过
- [x] 3.F1 FIX — Add channel badge to detail panel header (「走微信 · {wechat}」/「走邮件」)
- [x] 3.F2 FIX — Extend「上次催促」list column to show note on a second line
- [x] 3.F3 FIX — Localize channel values via channelLabel() (微信/邮件, not wechat/email)
- [x] 3.12 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开 `/nudge` 页核对课程 tab、表格、详情面板与 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 前端：复制文案 / 标记已催 / 跳过 的写入动作

### Contract
- **Spec**: 讲师点"标记已催"后名单 SHALL NOT 移除该学员，"已催次数"/"上次催促时间" SHALL 更新；点"跳过"后该学员 SHALL 从名单消失。编辑草稿只影响当次展示，SHALL NOT 影响下次选中同一人或切换到其他人后的默认模板。（`specs/nudge/spec.md`）
- **Runtime**: `cd frontend && npm run test -- NudgeClient actions` → expected: 全部通过，覆盖标记已催/跳过调用对应 Server Action 并触发重新取数、复制文案不发请求、编辑草稿不污染下次选中的默认值
- **Code**: `frontend/app/(app)/nudge/actions.ts` 新建 `markNudged`/`skipNudge` 两个 Server Action（参照 `homework/actions.ts` 的 `requireSitePassword` + `classify` 错误处理模式），成功后 `revalidatePath("/nudge", "layout")`；"复制文案"用浏览器 `navigator.clipboard`，纯前端、不经过 Server Action
- **Threshold**: 80

- [x] 4.0 CONTRACT — write openspec/changes/nudge/contracts/group-4.md with the ### Contract block above
- [x] 4.1 RED — 新增用例：点击"标记已催"调用 `markNudged`（带学员邮箱+课程 id），成功后名单仍显示该学员；此时按钮不存在/未接线，测试应失败
- [x] 4.2 GREEN — `actions.ts` 实现 `markNudged`；`NudgeClient.tsx` 接线按钮
- [x] 4.3 RED — 新增用例：点击"跳过"调用 `skipNudge`，成功后触发的重新取数结果里该学员不在名单中（mock `previewImport`-类似的重新加载模式，参照 `homework` 现有写入后 `revalidatePath` 的验证方式）
- [x] 4.4 GREEN — `actions.ts` 实现 `skipNudge`；接线按钮
- [x] 4.5 RED — 新增用例：编辑某学员草稿后选中另一人、再选回来，草稿恢复成默认生成的文本（不是刚才编辑的版本）
- [x] 4.6 GREEN — 确认草稿状态挂在"当前选中学员"维度、切换时重置（多数情况下 3.5 的实现已经满足，这一步用于确认）
- [x] 4.7 RED — 新增用例：点击"复制文案"不触发任何网络请求（`fetch`/action mock 均未被调用）
- [x] 4.8 GREEN — "复制文案"按钮直接调用 `navigator.clipboard.writeText`，不经过 Server Action
- [x] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 验证与收尾

- [x] 5.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [x] 5.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [x] 5.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [x] 5.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
