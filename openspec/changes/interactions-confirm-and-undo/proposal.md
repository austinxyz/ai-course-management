---
Date: 2026-08-10
Change: interactions-confirm-and-undo
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-10-interactions-confirm-and-undo-requirements.md
---

## Why

参与度信号上线后，讲师反馈"选学员+点信号就立即写入，点错了没法撤销"——这轮加一个确认步骤，并且第一次给互动记录开一个删除口子（只针对讲师手敲的两类：人工录入、参与度信号），让点错之后有救。

## What Changes

- 参与度信号点击后先弹确认框（"给 XX 标记 YY？"），确认后才真正写入
- **BREAKING**：`InteractionRead`/`Interaction`（前端类型）新增 `id` 字段——删除必须按主键定位，不能靠"学员+时间+类型"这种可能撞车的组合（`CLAUDE.md` 记录的坑）
- 新增 `DELETE /api/interactions/{id}`：只接受 `event_type` 为 `manual`/`participation` 的记录，其余类型（`nudged`/`skipped`/`unskipped`）返回 422 拒绝——后端硬挡，不只是前端不出按钮
- 独立页列表里，人工录入/参与度信号的行末新增删除按钮，点击后弹确认框，确认后调用删除接口

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `interactions`：手动写入路径新增确认步骤；新增删除能力（限定两类记录）；读接口响应新增 `id` 字段

## Impact

- `backend/app/schemas.py`：`InteractionRead` 新增 `id: uuid.UUID`
- `backend/app/routers/interactions.py`：`list_interactions` 附带 `id`；新增 `DELETE /api/interactions/{id}`，校验 `event_type` 才允许删
- `backend/tests/test_interactions.py`：新增删除路径测试（含拒绝删除自动事件的用例）
- `frontend/app/(app)/interactions/types.ts`：`Interaction` 新增 `id`
- `frontend/lib/api.ts`：`toInteraction` 带上 `id`；新增 `deleteInteraction()`
- `frontend/app/(app)/interactions/actions.ts`：新增 `deleteInteractionAction`，写入后同样两次 `revalidatePath`
- `frontend/app/(app)/interactions/ManualEntryPanel.tsx`：参与度信号点击后不直接调用 `onSubmitSignal`，先弹确认弹窗
- `frontend/app/(app)/interactions/InteractionsClient.tsx`：人工录入/参与度信号行末加删除按钮 + 删除确认弹窗
- 新增确认弹窗组件（复用 `EnrollmentModal.tsx` 视觉规范，具体拆分留给 design 阶段）

## Out of Scope

- 手动录入表单不加确认框（表单本身已经够谨慎）
- 系统自动事件（已催/跳过/取消跳过）不开放删除
- 删除不限时间窗口——这轮直接做成"随时能删"，不做时间窗口限制的中间版本
- 学员详情面板"最近互动"卡片不加删除入口
