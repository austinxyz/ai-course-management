---
Date: 2026-08-02
Change: homework-rubric
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-02-homework-rubric-requirements.md
---

## Why

`homework` spec 目前明确写着「系统 SHALL NOT 显示各分项的满分」——满分不在
`grades.csv` 里（在另一个仓库的 `rubric.md`，而那两份文件对过错，不可信）。
这条限制当初是刻意暂缓，本变更给满分一个应用内维护的数据源，把暂缓的三件事
（分项 X/满分、分项条形图、总分按比例着色）一并做掉。

## What Changes

- 新表 `homework_rubric_items`（`course_id` + `item` + `max_score`），讲师在课程页
  维护；分项名字系统自动从该课程已导入成绩里去重列出，不需要手打
- **BREAKING**：`homework` spec 的「系统 SHALL NOT 显示各分项的满分」这条限制取消，
  改为有满分数据时展示
- 作业详情面板：分项显示「X / 满分」+ 按比例条形图，条形图与分数文字按三档阈值
  染色（≥90% 绿、70%–90% 黄、<70% 红）；没配满分的项仍只显示原始分，不阻塞
- 总分显示进度条 + 三档颜色——**只有该课程全部分项都配了满分**才显示，没配全时
  总分只显示数字
- 名单表格每行新增一串迷你竖条（每个分项一根柱子，按同一套阈值染色），不点进
  详情就能看出弱项——沿用 2026-07-31 已画过的设计，阈值改成这次的 90/70

## Capabilities

### New Capabilities

（无——满分维护挂在 `homework` 能力下，不单独成一个能力）

### Modified Capabilities

- `homework` — 取消「不显示各分项满分」的限制；作业详情面板、名单表格新增满分相关
  展示；新增满分维护的读写端点

## Impact

- `supabase/migrations/`：新增 `homework_rubric_items` 表
- `backend/app/models.py`：新增 `HomeworkRubricItem`
- `backend/app/routers/homework.py`：`GET /api/homework/rubric?course=`（该课程去重
  分项名 + 已配满分）、`PUT /api/homework/rubric`（整表覆盖式写入，讲师在课程页一次
  提交全部改动）；`list_homework` 附带满分信息（供分项/总分染色与进度条计算）
- `backend/app/schemas.py`：请求/响应 schema
- `frontend/app/(app)/courses/`：满分维护表单
- `frontend/app/(app)/homework/`：详情面板、名单表格、类型/API 层同步

## Out of Scope

- 分项名的手工输入（一律从已导入成绩去重列出）
- 满分的批量导入
- 满分改动的历史留痕
- 同一门课分项名随时间变化时的特殊处理（旧分项名不再出现时，评分表里那条残留
  条目不做清理）
