---
Date: 2026-08-02
Change: homework-reply-status
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-02-homework-reply-status-requirements.md
---

## Why

`reply_status` 是 `grades.csv` 的纯镜像，每次重新导入整列覆盖。讲师实际回复学员是在
系统之外发生的，源文件那列常常没跟上，导致"待回复"名单挂着已经回复过的人。讲师需要
一个不受重新导入影响的地方记录"我确实回复过"。

## What Changes

- `HomeworkSubmission` 新增 `replied`（bool，默认 `false`）与 `replied_at`（服务端盖
  时间，客户端不可传）两个字段，导入时**不**在覆盖范围内
- 新增一个写入口，讲师可以切换某条提交的 `replied`（已回复 ↔ 未回复）
- 作业页详情面板新增"标记已回复"/"标记未回复"切换按钮
- 「待回复」筛选的判据从"已交且 `reply_status` ≠ 已回复"改成"已交且 `replied = false`"
- `reply_status`（源文件原文）继续原样展示，与 `replied`（手动标记）是两个独立信号，
  不合并显示

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `homework` —「回复状态原样取自源文件，系统不归一化」这条 Requirement 本身不变
  （`reply_status` 依然纯镜像）；「待回复」筛选判据从这条 Requirement 里拆出来，
  改用新的手动标记字段

## Impact

- `supabase/migrations/`：新增一条 migration，给 `homework_submissions` 加
  `replied` / `replied_at` 两列
- `backend/app/models.py`：`HomeworkSubmission` 加两个字段
- `backend/app/routers/homework.py`：`_classify` 的字段覆盖逻辑要显式排除这两列；
  新增切换端点
- `backend/app/schemas.py`：请求/响应 schema
- `frontend/app/(app)/homework/`：详情面板加按钮，筛选逻辑改判据，类型/API 层同步
- `frontend/lib/api.ts`：新增调用

## Out of Scope

- 不做列表行内的快捷标记（归详情面板一处）
- 不做批量标记
- 不追溯历史记录——变更上线前已导入的提交，`replied` 一律是默认值（未标记）
- 各分项满分展示（归 `homework-rubric`，单独一次 change）
