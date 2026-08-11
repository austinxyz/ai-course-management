### Contract
- **Spec**: 参与度信号点击后 SHALL 先弹确认弹窗，确认后才写入，取消不写入。人工录入/参与度信号的行 SHALL 有删除按钮，点击先弹确认弹窗，确认后才删除；系统自动事件的行 SHALL NOT 有删除按钮。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- Interactions ManualEntryPanel` → expected: 全部通过，覆盖信号确认/取消不写入/删除按钮只出现在两类记录/删除确认/取消不删除/删除后三处消费方刷新
- **Code**: 新增 `SignalConfirmDialog.tsx`、`DeleteConfirmDialog.tsx`（外观对齐 `EnrollmentModal.tsx`，design.md 决定 3、4）；`InteractionsClient.tsx` 统一持有 `pendingAction` 状态驱动两个弹窗（design.md 决定 5）；`ManualEntryPanel.tsx` 信号点击改成先抛"待确认"给父组件，不直接调用 `onSubmitSignal`；`lib/api.ts` 新增 `deleteInteraction()`；`interactions/actions.ts` 新增 `deleteInteractionAction`，两次 `revalidatePath`（design.md 决定 6）；`interactions/types.ts` 的 `Interaction` 新增 `id`
- **Threshold**: 70
