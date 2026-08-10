### Contract
- **Spec**: 学员详情面板"最近互动"卡片 SHALL 提供手动录入入口。课程下拉 SHALL 只列出该学员已报的课程。内容为空时 SHALL 阻止提交。写入成功后，详情面板、`/interactions` 独立页、侧边栏最近 7 天徽标三处 SHALL 都能反映新记录。（`specs/interactions/spec.md`）
- **Runtime**: `cd frontend && npm run test -- DetailPanel ManualInteraction` → expected: 全部通过，覆盖入口渲染/课程下拉过滤/空内容禁用提交/成功提交后 revalidate 调用
- **Code**: 新增 `frontend/app/(app)/students/ManualInteractionModal.tsx`（外观对齐 `EnrollmentModal.tsx`，design.md 决定 6）；`students/actions.ts` 新增 `createManualInteractionAction`，写入后调用 `revalidatePath("/students", "layout")` 与 `revalidatePath("/interactions")`（design.md 决定 5）；`frontend/lib/api.ts` 新增对应写请求封装；`DetailPanel.tsx` 加"+ 手动记录"入口按钮
- **Threshold**: 70
