### Contract
- **Spec**: 独立页 SHALL 提供来源 tab（全部/系统自动/人工录入/参与度）与搜索框（学员/类型/内容），二者可叠加；SHALL 提供常驻"记一条"面板（类型四选一，非渠道）与参与度信号区块（5 个固定标签，未选学员或学员无有效报课时禁用）；写入成功 SHALL 显示"已写入"提示条；`nudge` 页深链接 SHALL 预填搜索框。学员详情面板的"+ 手动记录"入口与旧弹窗 SHALL 移除。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- Interactions DetailPanel StudentsClient NudgeClient` → expected: 全部通过，覆盖来源 tab 筛选/搜索/叠加筛选/记一条表单/参与度信号禁用与点击写入/深链接预填搜索框/旧入口已移除
- **Code**: `InteractionsClient.tsx` 新增来源 tab 状态、搜索框状态；新增 `ManualEntryPanel.tsx`（记一条表单 + 参与度信号，共享同一个学员选择）；删除 `ManualInteractionModal.tsx`；`DetailPanel.tsx` 移除"+ 手动记录"按钮与 `onOpenManualInteraction` prop；`StudentsClient.tsx` 移除弹窗状态与 props；`actions.ts`/`lib/api.ts` 的手动录入封装改成判别式 `kind` 请求体，写入后 `revalidatePath("/interactions","layout")` + `revalidatePath("/students","layout")`；`interactions/page.tsx` 的 `?student=` 改填 `initialQuery`（design.md 决定 5、6、7、8）
- **Threshold**: 70
