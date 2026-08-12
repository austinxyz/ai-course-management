## 1. 后端：暴露记录 id + 删除端点（限定两类记录）

### Contract
- **Spec**: `InteractionRead` SHALL 暴露记录的 `id`。`DELETE /api/interactions/{id}` SHALL 删除 `event_type` 为 `manual`/`participation` 的记录；对 `nudged`/`skipped`/`unskipped` 类型的删除请求 SHALL 拒绝（422），不论请求是否来自前端界面。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖列表响应带 `id`/删除人工录入成功/删除参与度信号成功/拒绝删除自动事件/删除不存在的记录返回 404
- **Code**: `backend/app/schemas.py` 的 `InteractionRead` 新增 `id: uuid.UUID`；`backend/app/routers/interactions.py` 的 `list_interactions` 附带 `id`，新增 `DELETE /api/interactions/{id}`，删除前查记录、校验 `event_type` 在允许集合里才执行删除，不在集合里返回 422（design.md 决定 1、2）
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/interactions-confirm-and-undo/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `backend/tests/test_interactions.py`：新增用例，断言 `GET /api/interactions` 返回的每条记录都带 `id` 字段，值能在数据库里查到对应行；此时响应不含 `id`，断言应失败
- [x] 1.2 GREEN — `InteractionRead` 新增 `id: uuid.UUID`；`list_interactions` 构造响应时带上 `event.id`
- [x] 1.3 RED — 新增用例：创建一条 `kind="manual"` 的记录拿到它的 `id`，对这个 `id` 发 `DELETE /api/interactions/{id}`，断言返回 204，再 `GET /api/interactions` 断言这条记录不在列表里了
- [x] 1.4 GREEN — 新增 `DELETE /api/interactions/{id}`：查记录，`event_type` 是 `manual`/`participation` 就删除并返回 204
- [x] 1.5 RED — 新增用例：创建一条 `kind="participation"` 的记录，同样验证删除成功（多数情况下 1.4 已经覆盖，这一步用于确认边界）
- [x] 1.6 GREEN — 确认参与度信号记录的删除路径跟人工录入共用同一段逻辑（多数情况下 1.4 已经覆盖）
- [x] 1.7 RED — 新增用例：对一条 `event_type="nudged"` 的记录发 `DELETE`，断言返回 422，且这条记录还在列表里没被删（补充覆盖了 `skipped` 类型的等价用例）
- [x] 1.8 GREEN — 删除端点加 `event_type` 校验，不在允许集合里的返回 422，不执行删除
- [x] 1.9 RED — 新增用例：对一个不存在的 `id` 发 `DELETE`，断言返回 404
- [x] 1.10 GREEN — 记录查不到时返回 404（多数情况下 1.4 已经覆盖，这一步用于确认边界）
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：参与度信号确认弹窗 + 删除入口与确认弹窗

### Contract
- **Spec**: 参与度信号点击后 SHALL 先弹确认弹窗，确认后才写入，取消不写入。人工录入/参与度信号的行 SHALL 有删除按钮，点击先弹确认弹窗，确认后才删除；系统自动事件的行 SHALL NOT 有删除按钮。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- Interactions ManualEntryPanel` → expected: 全部通过，覆盖信号确认/取消不写入/删除按钮只出现在两类记录/删除确认/取消不删除/删除后三处消费方刷新
- **Code**: 新增 `SignalConfirmDialog.tsx`、`DeleteConfirmDialog.tsx`（外观对齐 `EnrollmentModal.tsx`，design.md 决定 3、4）；`InteractionsClient.tsx` 统一持有 `pendingAction` 状态驱动两个弹窗（design.md 决定 5）；`ManualEntryPanel.tsx` 信号点击改成先抛"待确认"给父组件，不直接调用 `onSubmitSignal`；`lib/api.ts` 新增 `deleteInteraction()`；`interactions/actions.ts` 新增 `deleteInteractionAction`，两次 `revalidatePath`（design.md 决定 6）；`interactions/types.ts` 的 `Interaction` 新增 `id`
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/interactions-confirm-and-undo/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-08-10-interactions-confirm-and-undo-mocks.html#signal-confirm-modal-desktop 与 #delete-confirm-modal-desktop 与 #list-row-delete-button-desktop 与 #mobile；记录两个弹窗的文案与按钮配色（信号确认用 primary 确认按钮，删除确认用 danger 确认按钮）、删除按钮样式与位置（行末 × 图标）
- [x] 2.2 RED — `frontend/app/(app)/interactions/ManualEntryPanel.test.tsx`：更新既有"点击信号立即写入"用例为"点击信号先触发待确认回调，不直接调用 `onSubmitSignal`"；此时点击直接调用 `onSubmitSignal`，断言应失败
- [x] 2.3 GREEN — `ManualEntryPanel.tsx` 新增 `onRequestSignal` prop，信号按钮点击调用它而不是直接调 `onSubmitSignal`
- [x] 2.4 RED — `frontend/app/(app)/interactions/InteractionsClient.test.tsx`：新增用例，点击信号按钮后断言出现确认弹窗（文案包含学员名与信号名），此时还没有调用写入；点"确认"后才调用写入并显示"已写入"；此时没有确认弹窗，测试应失败
- [x] 2.5 GREEN — 新建 `SignalConfirmDialog.tsx`；`InteractionsClient.tsx` 用 `pendingAction` 状态接住 `ManualEntryPanel` 的 `onRequestSignal`，渲染确认弹窗，确认后才调用 `onSubmitSignal`
- [x] 2.6 RED — 新增用例：点确认弹窗的"取消"，断言没有调用写入，弹窗关闭
- [x] 2.7 GREEN — 实现取消逻辑（清空 `pendingAction`，不调用任何写入函数）
- [x] 2.8 RED — 新增用例：传入跨来源的记录，断言 `manual`/`participation` 类型的行有删除按钮，`nudged` 类型的行没有
- [x] 2.9 GREEN — `InteractionsClient.tsx` 列表行按 `sourceCategory` 判断是否渲染删除按钮
- [x] 2.10 RED — 新增用例：点击删除按钮，断言出现删除确认弹窗，此时还没有调用删除；点"删除"后才调用删除（实际验证的是"删除成功后弹窗关闭+显示已删除提示"，不是"这一行从列表消失"——删除跟写入一样不在客户端本地摘除数据，真正的移除靠 `revalidatePath` 触发的服务端重新取数，这点跟"写入不本地插入新行"是同一套架构，测试据此调整）
- [x] 2.11 GREEN — 新建 `DeleteConfirmDialog.tsx`；删除按钮点击把 `pendingAction` 设成删除动作，确认后调用删除
- [x] 2.12 RED — `frontend/app/(app)/interactions/actions.test.ts`：新增用例，断言 `deleteInteractionAction` 成功后调用了 `revalidatePath("/interactions","layout")` 和 `revalidatePath("/students","layout")`；此时 action 不存在，断言应失败
- [x] 2.13 GREEN — `lib/api.ts` 新增 `deleteInteraction(id)`；`interactions/actions.ts` 新增 `deleteInteractionAction`，跟 `createInteractionAction` 一样用返回值表达失败、成功后两次 `revalidatePath`
- [x] 2.14 VISUAL DIFF — 站点 Basic Auth 挡住自动化浏览器，按既有降级方案改用组件级渲染核对：信号确认弹窗（primary 确认按钮，文案"给 XX 标记「YY」？"）、删除确认弹窗（danger 确认按钮，文案含摘要+"删除后不能恢复"）、删除按钮位置（行末 × 图标，仅 manual/participation 行）均与 mock 一致
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与收尾

- [x] 3.1 Run backend test suite — ensure no regressions (`cd backend && pytest`) — 306 passed
- [x] 3.2 Run frontend test suite — ensure no regressions (`cd frontend && npm run test`) — 371 passed | 1 skipped
- [x] 3.3 Run e2e suite if applicable — 无配置（`project.e2e_command` 为空），跳过
- [x] 3.4 Run superpowers:verification-before-completion（`console.log` 审查无命中；环境变量泄漏检查无命中）
