---
Date: 2026-08-03
Change: nudge
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-03-nudge-requirements.md
---

## Why

讲师现在只能在脑子里记"谁没交、催过没有"——"未交"这个判断本系统已经算得出来，但没有地方把它变成一个可操作的催促工作流。这是 `docs/requirements.md` §4.4 列的核心工作流，一直没做。

## What Changes

- 新增 `/nudge` 页：按课程展示"已报课但未交作业"的名单（复用 `/homework` 页现有的"未交"判定），每人带逾期天数、已催次数、上次催促时间。
- 系统为选中的人自动起草一份催促文案（固定模板，套姓名/课程/逾期天数），讲师可在详情面板直接改这份草稿。
- 讲师"复制文案"自己发送（邮件或微信，本次不接真实发信通道），发完点"标记已催"写一条记录；也可以"跳过"这条未交（从名单排除，直到重新出现未交状态）。
- 新增最小化的互动事件记录（`nudge_events`）：只记催作业自己产生的事件（已催/跳过），字段设计上为将来长成完整的「互动记录」能力留口子，但这次不建人工录入、不建参与度信号导入的入口。

## Capabilities

### New Capabilities

- `nudge` —— 未交名单、逾期计算、草稿生成、标记已催/跳过、`nudge_events` 记录与查询

### Modified Capabilities

（无——`homework`/`enrollment`/`student-roster` 只被读取，不改变它们的既有行为或数据结构）

## Impact

- 新表：`nudge_events`（`supabase/migrations/`）
- 后端新路由 `backend/app/routers/nudge.py`：`GET /api/nudge?course=`（名单+统计）、`POST /api/nudge/events`（记一条已催/跳过）
- 前端新页面 `frontend/app/(app)/nudge/`：`page.tsx` + `NudgeClient.tsx`，侧边栏导航加一项
- `frontend/lib/api.ts` 新增对应调用与蛇形→驼峰映射

## Out of Scope

- 真实发信通道（Gmail OAuth、微信自动发送）——沿用"人工复制发送"，见 Non-Goals
- 多套文案模板/语气切换——固定一个模板
- "导出名单"CSV
- 完整互动记录能力（人工录入 1:1 沟通、参与度信号导入）——这两个来源的入口留给未来单独的 change
- 批量勾选发送——按人逐条操作
