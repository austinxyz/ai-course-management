---
Date: 2026-08-09
Change: interactions-manual-entry
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-09-interactions-manual-entry-requirements.md
---

## Why

`interactions` 目前是纯只读聚合视图——数据全部来自催作业流程自动产生的 `nudge_events`。讲师没法记一条不属于催作业流程的互动（比如微信里聊了下学习进度）。原始设计稿列过"记录来源：催作业 / 答疑 / 手动"三种，这次先补上"手动"这一种，"答疑"留到下一轮。

## What Changes

- 新增 `POST /api/interactions` 写入口：给某个学员的某门已报课程手动记一条互动（渠道二选一：微信/邮件，内容必填），`event_type` 固定为 `manual`，时间自动取服务器当前时刻
- 学员详情面板"最近互动"卡片新增"+ 手动记录"入口，弹窗外观复用 `EnrollmentModal.tsx`（报课补录弹窗）的既有规范
- 手动记录跟催作业自动产生的记录（已催/跳过/取消跳过）混在同一份数据里，`/interactions` 独立页、侧边栏最近 7 天徽标、详情面板"最近互动"三处都要在写入后保持一致

## Capabilities

### New Capabilities

（无——扩展现有 `interactions` 能力，不新增能力）

### Modified Capabilities

- `interactions`：新增"手动录入互动记录"的 SHALL 语句（写入口、表单校验、三处消费方一致性）

## Impact

- `backend/app/routers/interactions.py`：新增 `POST /api/interactions`
- `backend/app/schemas.py`：新增写入请求/响应 schema
- `backend/tests/test_interactions.py`：新增写路径测试
- `frontend/app/(app)/students/DetailPanel.tsx`：新增"+ 手动记录"入口
- `frontend/app/(app)/students/`：新增 `ManualInteractionModal.tsx`（对齐 `EnrollmentModal.tsx` 规范）
- `frontend/app/(app)/students/actions.ts`：新增 `createManualInteractionAction`
- `frontend/lib/api.ts`：新增对应的 fetch 封装
- 不改 `nudge_events` 表结构——`event_type` 本来就是 `str`，新增 `"manual"` 取值即可

## Out of Scope

- "答疑"作为独立来源的 `event_type`——留到下一轮 `interactions-qa-entry`（或类似命名）
- 编辑、删除手动记录——跟项目"只增不删"原则一致
- 补录历史时间——时间固定取服务器当前时刻
- 无课程的互动记录——`course_id` 保持必填外键，不改表结构
