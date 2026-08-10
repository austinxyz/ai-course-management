## 1. 后端：写入口改造（类型/信号 + 课程自动推导）

### Contract
- **Spec**: 手动录入 SHALL 记录事情性质类型（1:1 沟通/咨询/技术支持/作业反馈四选一）与必填内容，课程 SHALL 由系统自动取该学员未退课报课记录里 `enrolledAt` 最大的一条，没有有效报课时 SHALL 拒绝。参与度信号 SHALL 支持 5 个固定标签立即写入，课程同样自动推导，没有有效报课时 SHALL 拒绝。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖手动录入四类型/参与度信号五标签/课程自动推导（含无有效报课时拒绝）/`channel` 列复用两种含义
- **Code**: `backend/app/schemas.py` 的 `ManualInteractionCreate` 移除 `channel`/`course_id`，改成 `kind: Literal["manual","participation"]` 判别式，`manual` 必须带 `type`（四选一）+`note`（必填非空），`participation` 必须带 `signal`（五选一）；`backend/app/routers/interactions.py` 新增 `_latest_active_course()` 查询（排除 `withdrawn`，按 `enrolled_at` 降序取第一条），写入时 `event_type` 按 `kind` 固定为 `manual`/`participation`，`channel` 列存类型 key 或信号 key（design.md 决定 1、2、4、5）
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/interactions-design-alignment/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — `backend/tests/test_interactions.py`：新增用例，`kind="manual"`、`type="1on1"`、`note="聊了下学习进度"`（学员有一条未退课报课），断言 `POST /api/interactions` 返回 201，`event_type="manual"`、`channel="1on1"`、课程是该学员未退课报课里 `enrolled_at` 最大的那条对应的课程；此时端点还按旧 schema 走，断言应失败
- [ ] 1.2 GREEN — 改造 `ManualInteractionCreate` 为判别式 schema（`kind`/`type`/`signal`/`note`，不再收 `channel`/`course_id`）；`create_manual_interaction` 改用 `_latest_active_course()` 推导课程，按 `kind` 写入 `event_type`/`channel`
- [ ] 1.3 RED — 新增用例：`kind="participation"`、`signal="live"`（学员有一条未退课报课），断言返回 201，`event_type="participation"`、`channel="live"`、`note=""`
- [ ] 1.4 GREEN — 确认 `kind="participation"` 分支写入逻辑覆盖（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.5 RED — 新增用例：`kind="manual"` 但 `type` 不在四选一集合里（如 `"other"`），断言 422；`kind="participation"` 但 `signal` 不在五选一集合里，断言 422
- [ ] 1.6 GREEN — 确认 `type`/`signal` 都是 `Literal` 枚举，非法值天然 422（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.7 RED — 新增用例：学员的所有报课都是 `withdrawn` 状态（或完全没有报课记录），提交 `kind="manual"` 或 `kind="participation"`，断言返回 422 且 detail 文案说明"没有有效报课"
- [ ] 1.8 GREEN — `_latest_active_course()` 查不到结果时，端点提前返回 422
- [ ] 1.9 RED — 新增用例：学员有两条未退课报课（`enrolled_at` 不同），断言取的是日期更晚的那条对应的课程，不是插入顺序里的第一条
- [ ] 1.10 GREEN — 确认 `_latest_active_course()` 的排序是 `ORDER BY enrolled_at DESC`（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.11 RED — 新增用例：`kind="manual"` 但 `note` 为空白，断言 422，不写入记录
- [ ] 1.12 GREEN — 确认 `note` 非空校验在新 schema 下依然生效（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：独立页改造（来源 tab、搜索、常驻录入面板、参与度信号）+ 旧入口清理

### Contract
- **Spec**: 独立页 SHALL 提供来源 tab（全部/系统自动/人工录入/参与度）与搜索框（学员/类型/内容），二者可叠加；SHALL 提供常驻"记一条"面板（类型四选一，非渠道）与参与度信号区块（5 个固定标签，未选学员或学员无有效报课时禁用）；写入成功 SHALL 显示"已写入"提示条；`nudge` 页深链接 SHALL 预填搜索框。学员详情面板的"+ 手动记录"入口与旧弹窗 SHALL 移除。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- Interactions DetailPanel StudentsClient NudgeClient` → expected: 全部通过，覆盖来源 tab 筛选/搜索/叠加筛选/记一条表单/参与度信号禁用与点击写入/深链接预填搜索框/旧入口已移除
- **Code**: `InteractionsClient.tsx` 新增来源 tab 状态、搜索框状态；新增 `ManualEntryPanel.tsx`（记一条表单 + 参与度信号，共享同一个学员选择）；删除 `ManualInteractionModal.tsx`；`DetailPanel.tsx` 移除"+ 手动记录"按钮与 `onOpenManualInteraction` prop；`StudentsClient.tsx` 移除弹窗状态与 props；`actions.ts`/`lib/api.ts` 的手动录入封装改成判别式 `kind` 请求体，写入后 `revalidatePath("/interactions","layout")` + `revalidatePath("/students","layout")`；`interactions/page.tsx` 的 `?student=` 改填 `initialQuery`（design.md 决定 5、6、7、8）
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/interactions-design-alignment/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-10-interactions-design-alignment-mocks.html#interactions-page-desktop 与 #interactions-page-no-enrollment-desktop 与 #mobile；记录来源 tab 样式与计数、搜索框位置、常驻面板布局（学员/类型四选一/内容/参与度信号区块）、来源徽标三色配色、归属列、"已写入" toast
- [ ] 2.2 RED — `frontend/app/(app)/interactions/InteractionsClient.test.tsx`：新增用例，传入跨来源（nudged/manual/participation）的记录，断言默认"全部" tab 展示全部，各 tab 数字正确；此时没有来源 tab，测试应失败
- [ ] 2.3 GREEN — `InteractionsClient.tsx` 新增来源 tab（全部/系统自动/人工录入/参与度），按 `event_type` 分类计数与筛选，替换原有的学员下拉与时间范围预设
- [ ] 2.4 RED — 新增用例：点击"人工录入" tab 后再在搜索框输入学员姓名的一部分，断言列表只剩这个学员的人工录入记录（叠加筛选）
- [ ] 2.5 GREEN — 实现搜索框（匹配学员姓名/邮箱/类型 label/内容），与来源 tab 叠加生效
- [ ] 2.6 RED — 新建 `frontend/app/(app)/interactions/ManualEntryPanel.test.tsx`：传入学员列表，断言参与度信号 5 个按钮在未选学员时禁用；此时组件不存在，测试应失败
- [ ] 2.7 GREEN — 新建 `ManualEntryPanel.tsx`：学员下拉、类型四选一 pill、内容 textarea、提交按钮；参与度信号 5 个固定标签按钮，disabled 状态取决于"是否选中学员"与"该学员是否有有效报课"
- [ ] 2.8 RED — 新增用例：选中一名有有效报课的学员后，点击"出席直播"，断言触发 `onSignal` 回调且不需要额外确认步骤
- [ ] 2.9 GREEN — 实现参与度信号点击即触发回调（不经过"提交"按钮）
- [ ] 2.10 RED — 新增用例：选中一名没有任何未退课报课记录的学员，断言"记一条"提交按钮与全部信号按钮都禁用，且显示说明性文案
- [ ] 2.11 GREEN — `ManualEntryPanel` 接受 `hasActiveEnrollment: boolean` prop（由调用方基于 `enrollments` 数据算出），驱动上述禁用态与文案
- [ ] 2.12 RED — `frontend/app/(app)/interactions/InteractionsClient.test.tsx`：新增用例，模拟成功写入后断言页面顶部出现"已写入"提示条，点"知道了"后消失
- [ ] 2.13 GREEN — 实现写入成功后的 toast 状态
- [ ] 2.14 RED — `frontend/app/(app)/interactions/page.test.tsx`：断言 `searchParams.student` 存在时，传给 `InteractionsClient` 的是 `initialQuery`（学员邮箱），不是旧的 `initialStudent`
- [ ] 2.15 GREEN — `page.tsx` 改传 `initialQuery`；`InteractionsClient` 用它初始化搜索框状态
- [ ] 2.16 RED — `frontend/app/(app)/students/DetailPanel.interactions.test.tsx`：更新既有"+ 手动记录"按钮用例为断言该按钮**不再存在**；此时按钮还在，断言应失败
- [ ] 2.17 GREEN — `DetailPanel.tsx` 移除"+ 手动记录"按钮与 `onOpenManualInteraction` prop；同步更新 `DetailPanel.archive.test.tsx`/`layout-two-column.test.tsx` 里传的 props
- [ ] 2.18 RED — `frontend/app/(app)/students/StudentsClient.interactions.test.tsx`：删除依赖旧弹窗行为的用例（课程下拉排除退课那条），改为断言 `StudentsClient` 不再渲染 `ManualInteractionModal`
- [ ] 2.19 GREEN — `StudentsClient.tsx` 移除 `showManualInteraction` 状态、`ManualInteractionModal` 渲染、`onOpenManualInteraction` 传参；删除 `ManualInteractionModal.tsx` 与其测试文件
- [ ] 2.20 RED — `frontend/app/(app)/students/actions.test.ts`：更新 `createManualInteractionAction` 相关用例为新的判别式请求体（`kind`/`type`/`signal`），断言 `revalidatePath` 调用变成 `("/interactions","layout")` + `("/students","layout")`
- [ ] 2.21 GREEN — `actions.ts`/`lib/api.ts` 按 design.md 决定 5、6 改造写请求封装
- [ ] 2.22 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；核对独立页（tab/搜索/常驻面板/参与度信号/toast）与详情面板（按钮已移除）跟 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [ ] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [ ] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [ ] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [ ] 3.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查；额外检查生产库是否已有上一轮写入的旧版 `manual` 记录，如有需确认 `channel` 映射函数有 fallback，见 design.md Migration Plan）
