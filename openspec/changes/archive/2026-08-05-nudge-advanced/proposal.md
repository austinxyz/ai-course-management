---
Date: 2026-08-04
Change: nudge-advanced
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-04-nudge-advanced-requirements.md
---

## Why

`nudge` MVP 上线后跟最早那份 Claude Design 导入稿（`ClaudeAI课程学员管理页.dc.html#isNudge`）对比，有四处差距不是"做错了"而是 MVP 有意先砍掉的：多档文案模板、导出名单、进度指示、已跳过人数展示。这次把这四项补上，仍然不接真实发信。

## What Changes

- 详情面板新增三档文案模板 tab（第一次提醒/第二次提醒/最后一次），按该学员已催次数自动推荐默认档位，讲师可手动切换。
- 名单页新增"导出名单"按钮，导出当前课程未交名单 CSV（姓名/邮箱/微信/逾期天数/已催次数）。
- 名单页头部改用匹配实际流程的 3 步进度指示（算名单→起草文案→标记/跳过），替换掉不适用的原设计 4 步。
- 名单页头部摘要行新增"已跳过 N 人"，与"未交 N 人"并列显示。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `nudge` —— 新增文案模板选择、导出、进度指示、跳过人数统计四项需求

## Impact

- `backend/app/routers/nudge.py`：`GET /api/nudge?course=` 响应新增 `skipped_count` 字段
- `backend/app/schemas.py`：`NudgePersonRead` 所在响应体的外层新增字段（详见 design.md 对"整份名单响应"的重新包装决定）
- `frontend/app/(app)/nudge/NudgeClient.tsx`：模板 tab、进度指示、头部统计行、导出按钮（CSV 生成走前端，用已有的 `people` 数据，不新增网络请求）
- `frontend/app/(app)/nudge/types.ts`：类型调整以承载 `skippedCount`

## Out of Scope

- 真实发信通道（Gmail OAuth、微信自动发送）——留给下一个 change
- 批量发送/批量标记
- 完整互动记录能力（人工录入、参与度信号导入）
