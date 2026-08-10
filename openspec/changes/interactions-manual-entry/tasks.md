## 1. 后端：手动录入互动记录写入口

### Contract
- **Spec**: 讲师 SHALL 能够为某个学员的某门已报课程手动录入一条互动记录，渠道二选一（微信/邮件），内容必填不能为空/纯空白。时间 SHALL 是服务器接收请求时的当前时刻，不接受调用方指定。写入的 `event_type` SHALL 固定为 `manual`，不接受调用方指定。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖成功创建/空内容拒绝/非法渠道拒绝/不存在的学员或课程拒绝/`event_type` 不接受调用方覆盖
- **Code**: `backend/app/routers/interactions.py` 新增 `POST /api/interactions`；`backend/app/schemas.py` 新增 `ManualInteractionCreate`（不含 `event_type` 字段，`channel` 用 `Literal["wechat","email"]`，`note` 用 `field_validator` 拒绝空白）；不改 `nudge_events` 表结构（design.md 决定 1、3、4）
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/interactions-manual-entry/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — `backend/tests/test_interactions.py`：新增用例，某学员某课程提交 `channel="wechat"`、`note="聊了下学习进度"`，断言 `POST /api/interactions` 返回 201，响应里 `event_type` 是 `"manual"`，`at` 接近当前时间；此时端点不存在，断言应失败（404）
- [ ] 1.2 GREEN — `backend/app/schemas.py` 新增 `ManualInteractionCreate`（`student_email`/`course_id`/`channel`/`note`，不含 `event_type`）；`backend/app/routers/interactions.py` 新增 `POST /api/interactions`，写一条 `NudgeEvent(event_type="manual", ...)`
- [ ] 1.3 RED — 新增用例：`note` 为空字符串或纯空白（如 `"   "`）时，断言返回 422，不创建记录
- [ ] 1.4 GREEN — `ManualInteractionCreate` 加 `field_validator("note")`，`strip()` 后长度为 0 则拒绝
- [ ] 1.5 RED — 新增用例：`channel` 传一个不在 `wechat`/`email` 里的值（如 `"phone"`），断言返回 422
- [ ] 1.6 GREEN — 确认 `channel: Literal["wechat", "email"]` 已经覆盖这个边界（多数情况下 1.2 已经覆盖，这一步用于确认）
- [ ] 1.7 RED — 新增用例：`student_email` 或 `course_id` 指向不存在的学员/课程，断言返回 404 且 detail 文案能区分是学员还是课程找不到
- [ ] 1.8 GREEN — 仿照 `enrollments.py` 的 `_load_course` 先例，写入前查一次学员和课程，不存在则 404
- [ ] 1.9 RED — 新增用例：请求体额外带一个 `event_type` 字段（尝试伪造成 `"nudged"`），断言响应里的 `event_type` 仍然是 `"manual"`，不是请求体里那个值
- [ ] 1.10 GREEN — 确认 `ManualInteractionCreate` schema 不声明 `event_type` 字段，FastAPI 会静默丢弃多余字段（多数情况下 1.2 已经覆盖，这一步用于确认边界）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：学员详情面板手动录入入口

### Contract
- **Spec**: 学员详情面板"最近互动"卡片 SHALL 提供手动录入入口。课程下拉 SHALL 只列出该学员已报的课程。内容为空时 SHALL 阻止提交。写入成功后，详情面板、`/interactions` 独立页、侧边栏最近 7 天徽标三处 SHALL 都能反映新记录。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- DetailPanel ManualInteraction` → expected: 全部通过，覆盖入口渲染/课程下拉过滤/空内容禁用提交/成功提交后 revalidate 调用
- **Code**: 新增 `frontend/app/(app)/students/ManualInteractionModal.tsx`（外观对齐 `EnrollmentModal.tsx`，design.md 决定 6）；`students/actions.ts` 新增 `createManualInteractionAction`，写入后调用 `revalidatePath("/students", "layout")` 与 `revalidatePath("/interactions")`（design.md 决定 5）；`frontend/lib/api.ts` 新增对应写请求封装；`DetailPanel.tsx` 加"+ 手动记录"入口按钮
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/interactions-manual-entry/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-09-interactions-manual-entry-mocks.html#detail-panel-manual-entry-desktop 与 #manual-entry-modal-desktop 与 #mobile；记录"+ 手动记录"按钮位置、弹窗字段顺序（课程/渠道/内容）、manual 徽标配色（蓝色系，跟已催/跳过/取消跳过三色区分）
- [ ] 2.2 RED — `frontend/app/(app)/students/DetailPanel.test.tsx`：新增用例，断言"最近互动"卡片标题行有一个"+ 手动记录"按钮；此时没有这个按钮，测试应失败
- [ ] 2.3 GREEN — `DetailPanel.tsx` 加"+ 手动记录"按钮，点击后触发打开弹窗的回调（新增 `onOpenManualInteraction` prop，跟 `onAddEnrollment` 同一种模式）
- [ ] 2.4 RED — 新建 `frontend/app/(app)/students/ManualInteractionModal.test.tsx`：传入该学员的报课列表（2 门已报 + 1 门该学员没报的），断言课程下拉只出现已报的 2 门；此时组件不存在，测试应失败
- [ ] 2.5 GREEN — 新建 `ManualInteractionModal.tsx`：课程下拉（`enrollments` 过滤出的已报课程）、渠道单选（微信/邮件）、内容 textarea，外观对齐 `EnrollmentModal.tsx`
- [ ] 2.6 RED — 新增用例：内容为空时"保存"按钮禁用；填入内容后启用
- [ ] 2.7 GREEN — 实现 `canSave` 校验（`!!courseId && note.trim().length > 0 && !busy`，跟 `EnrollmentModal` 的 `canSave` 同一种写法）
- [ ] 2.8 RED — 新增用例：提交失败时（`onSave` 返回 `{ok:false, message}`），断言错误文案 inline 显示在弹窗里，弹窗不关闭
- [ ] 2.9 GREEN — 实现失败态展示（对齐 `EnrollmentModal` 的 `error` 状态处理）
- [ ] 2.10 RED — `frontend/app/(app)/students/actions.test.ts`（如果该文件不存在则新建）：断言 `createManualInteractionAction` 成功写入后调用了 `revalidatePath("/students", "layout")` 和 `revalidatePath("/interactions")` 两次；此时 action 不存在，断言应失败
- [ ] 2.11 GREEN — `students/actions.ts` 新增 `createManualInteractionAction`，跟 `createEnrollmentAction` 一样用返回值表达预期内失败（不 throw），成功后两次 `revalidatePath`
- [ ] 2.12 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；核对详情面板按钮与弹窗跟 mock 一致（若站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对并如实记录）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [ ] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`)
- [ ] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`)
- [ ] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [ ] 3.4 Run superpowers:verification-before-completion（运行 `openspec/config.yaml` 里的 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；`project.custom_verification_checks` 两条环境变量泄漏检查）
