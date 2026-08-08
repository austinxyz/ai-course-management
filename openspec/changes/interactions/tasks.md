## 1. 后端：互动记录只读端点

### Contract
- **Spec**: 系统 SHALL 提供一个独立页面展示全部学员的互动历史，数据源 `nudge_events`，按时间倒序。侧边栏"互动记录"数字徽标 SHALL 显示最近 7 天互动条数，没有记录时 SHALL 显示 0。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖列表按时间倒序/JOIN 出学员姓名与课程名/最近 7 天计数含 0 条边界
- **Code**: 新增 `backend/app/routers/interactions.py`：`GET /api/interactions` 全量返回（JOIN `students`+`courses`，不接受任何过滤参数，design.md 决定 1）；`GET /api/interactions/count` 固定"最近 7 天"窗口、不接受参数；`backend/app/schemas.py` 新增 `InteractionRead`/`InteractionListRead`/`InteractionCountRead`
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/interactions/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — `backend/tests/test_interactions.py`：新建文件，某课程有 2 条 `nudge_events`（不同时间），断言 `GET /api/interactions` 按 `created_at` 倒序返回，每条带学员姓名与课程名；此时端点不存在，断言应失败（404）
- [ ] 1.2 GREEN — 新建 `backend/app/routers/interactions.py`：`InteractionRead` schema + `GET /api/interactions`（JOIN `NudgeEvent`+`Student`+`Course`，按 `created_at desc` 排序），注册进 `app/main.py`
- [ ] 1.3 RED — 新增用例：混合多个学员多门课程的事件，断言返回条数与字段（`event_type`/`channel`/`note`）跟源数据一致，不遗漏跳过/取消跳过类型的事件（这些 `channel` 为 `None`）
- [ ] 1.4 GREEN — 确认查询不过滤 `event_type`，跳过/取消跳过/已催三类事件都出现在结果里（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.5 RED — 新增用例：一条 8 天前的事件 + 一条 3 天前的事件，断言 `GET /api/interactions/count` 返回 1（只算最近 7 天）
- [ ] 1.6 GREEN — `GET /api/interactions/count`：`created_at >= now() - 7 days` 的计数查询
- [ ] 1.7 RED — 新增用例：没有任何 `nudge_events` 时，断言 `count` 返回 0（不是 404 或缺字段）
- [ ] 1.8 GREEN — 确认空表时计数查询天然返回 0（多数情况下 1.6 已经覆盖，这一步用于确认边界）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：共享格式化函数 + 互动记录独立页面

### Contract
- **Spec**: 独立页面 SHALL 展示全部学员的互动记录，按时间倒序；SHALL 支持按学员过滤、SHALL 支持按时间范围过滤（今天/最近7天/最近30天/自定义），两者可同时生效；学员筛选器 SHALL 只列出有过互动记录的学员；筛选结果为空时 SHALL 显示说明性文案。侧边栏"互动记录"徽标 SHALL 显示最近 7 天条数。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- Interactions format` → expected: 全部通过，覆盖默认全量展示/学员过滤/时间范围过滤/筛选器只含有记录的学员/空结果文案/侧边栏徽标
- **Code**: 新增 `frontend/lib/format.ts`（`formatAt`/`channelLabel` 从 `nudge/NudgeClient.tsx` 搬过来，design.md 决定 3）；新增 `frontend/app/(app)/interactions/`（`page.tsx`/`InteractionsClient.tsx`/`types.ts`）；`GET /api/interactions` 全量拉取，筛选逻辑全部在客户端（design.md 决定 1）；学员筛选器选项从已加载列表去重推出（design.md 决定 2）
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/interactions/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-07-interactions-mocks.html#timeline-page-desktop 与 #timeline-empty-desktop 与 #mobile；记录侧边栏导航项样式、筛选栏（学员下拉 + 时间范围预设按钮）、事件类型徽标配色（已催=橙/跳过=灰/取消跳过=绿）、空态文案
- [ ] 2.2 RED — `frontend/lib/format.test.ts`：新建文件，断言 `formatAt`/`channelLabel` 的既有行为（从 `nudge/NudgeClient.test.tsx` 里对应用例搬一份过来）；此时模块不存在，测试应失败
- [ ] 2.3 GREEN — 新建 `frontend/lib/format.ts`，`nudge/NudgeClient.tsx` 改为从这里导入，删除本地重复定义
- [ ] 2.4 RED — 运行 `frontend/app/(app)/nudge/NudgeClient.test.tsx`（不改动测试内容），确认格式化函数搬家后 `nudge` 页既有行为不受影响（回归保护）
- [ ] 2.5 GREEN — 确认 2.3 的搬家没有破坏 `nudge` 现有测试（多数情况下 2.3 已经覆盖，这一步用于确认边界）
- [ ] 2.6 RED — `frontend/app/(app)/interactions/InteractionsClient.test.tsx`：新建文件，传入跨学员跨课程的互动列表，断言默认按时间倒序展示全部；此时组件不存在，测试应失败
- [ ] 2.7 GREEN — 新建 `InteractionsClient.tsx`：渲染全量列表，事件类型徽标（已催/跳过/取消跳过），时间用 `formatAt`，渠道用 `channelLabel`
- [ ] 2.8 RED — 新增用例：选中学员筛选器某个学员，断言列表只剩这个人的记录
- [ ] 2.9 GREEN — 实现学员筛选（客户端 `.filter()`）
- [ ] 2.10 RED — 新增用例：点击"最近 7 天"预设，断言列表只剩 7 天内的记录；构造一条 10 天前的记录验证被过滤掉
- [ ] 2.11 GREEN — 实现时间范围筛选（预设 + 自定义起止日期）
- [ ] 2.12 RED — 新增用例：学员筛选下拉的选项只包含传入列表里实际出现过的学员，不包含额外传入的"全体学员"名单
- [ ] 2.13 GREEN — 筛选器选项从 `interactions` 列表去重推出（design.md 决定 2 的 `useMemo`）
- [ ] 2.14 RED — 新增用例：筛选组合下结果为空时，断言显示说明性文案（例如"这段时间没有互动记录"）
- [ ] 2.15 GREEN — 实现空结果文案
- [ ] 2.16 RED — `frontend/app/(app)/interactions/page.test.tsx`（或侧边栏组件测试）：断言侧边栏"互动记录"徽标显示 `getInteractionsCount()` 返回的数字，包括 0 的情形
- [ ] 2.17 GREEN — `page.tsx` 接入 `GET /api/interactions/count`，侧边栏导航项显示该数字
- [ ] 2.18 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；核对独立页面与 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：学员详情面板嵌入 + 催作业页跳转

### Contract
- **Spec**: 学员详情面板 SHALL 展示该学员最近互动，最多 5 条，按时间倒序；没有记录时 SHALL 显示说明性文案。`nudge` 页"查看互动记录"入口 SHALL 跳转到互动记录页且预筛选为当前学员。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- DetailPanel NudgeClient` → expected: 全部通过，覆盖最近 5 条展示/无记录文案/跳转链接带预筛选参数
- **Code**: `students/page.tsx` 新增 `getInteractions()` 一次性拉取，`StudentsClient.tsx` 客户端过滤后 `.slice(0, 5)` 传给 `DetailPanel`（design.md 决定 4，跟 `enrollments` 现有模式一致）；`interactions/page.tsx` 读 `searchParams.student` 作为初始筛选值（design.md 决定 5）；`nudge/NudgeClient.tsx` 的"查看互动记录"按钮改成 `<Link href={`/interactions?student=${email}`}>`
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/interactions/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-08-07-interactions-mocks.html#detail-panel-card-desktop 与 #detail-panel-card-empty-desktop 与 #mobile；记录"最近互动"卡片的 section-label 排版、事件行样式、空态文案
- [ ] 3.2 RED — `frontend/app/(app)/students/DetailPanel.test.tsx`：新增用例，传入 8 条互动记录，断言"最近互动"区块只显示最新 5 条；此时没有这个区块，测试应失败
- [ ] 3.3 GREEN — `DetailPanel.tsx` 新增"最近互动"卡片，接受 `interactions` prop，渲染前 5 条
- [ ] 3.4 RED — 新增用例：`interactions` 为空数组时，断言显示"还没有互动记录"
- [ ] 3.5 GREEN — 实现空态文案
- [ ] 3.6 RED — `frontend/app/(app)/students/StudentsClient.test.tsx`：新增用例，传入跨学员的 `interactions` 列表，选中某学员后断言 `DetailPanel` 收到的是按该学员过滤、最多 5 条、时间倒序的子集
- [ ] 3.7 GREEN — `StudentsClient.tsx` 按选中学员过滤 `interactions`（`.filter().slice(0, 5)`），`page.tsx` 接入 `getInteractions()`
- [ ] 3.8 RED — `frontend/app/(app)/nudge/NudgeClient.test.tsx`：新增用例，断言"查看互动记录"按钮的 `href` 是 `/interactions?student=<当前学员邮箱>`
- [ ] 3.9 GREEN — 把"查看互动记录"从占位按钮改成 `Link`，带上 `?student=` 查询参数
- [ ] 3.10 RED — `frontend/app/(app)/interactions/page.test.tsx`：断言 `searchParams.student` 存在时，传给 `InteractionsClient` 的初始筛选值是这个学员
- [ ] 3.11 GREEN — `interactions/page.tsx` 读 `searchParams.student`，作为 `InteractionsClient` 的初始筛选 prop
- [ ] 3.12 VISUAL DIFF — 核对"最近互动"卡片与 mock 一致（同样的 Basic Auth 降级方案）
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证与收尾

- [ ] 4.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [ ] 4.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [ ] 4.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [ ] 4.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
