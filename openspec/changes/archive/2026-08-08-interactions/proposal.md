---
Date: 2026-08-07
Change: interactions
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-07-interactions-requirements.md
---

## Why

`nudge` 的 `nudge_events` 表从设计之初就留了口子（字段设计上能长成完整的三来源互动记录能力），但一直只在 `nudge` 页自己的详情面板里用，没有任何地方能看到跨学员、跨课程的互动全貌。讲师想知道"某个学员最近都有哪些互动"或"这周整体活跃度"，现在只能一门课一门课翻 `nudge` 页。这次把已经存在的数据加一层可视化。

## What Changes

- 新增侧边栏导航项"互动记录"，独立页面展示全部学员的互动历史（数据源：`nudge_events`），时间倒序，可按学员和时间范围（今天/最近7天/最近30天/自定义）过滤。
- 侧边栏"互动记录"数字徽标显示最近 7 天互动条数。
- 学员详情面板（`DetailPanel`）新增"最近互动"卡片，内嵌最多 5 条。
- `nudge` 页既有的"查看互动记录"按钮（设计稿里画出来但未接线）接到新页面，跳转后预筛选为当前学员。

## Capabilities

### New Capabilities

- `interactions` —— 新能力：只读聚合视图，数据完全来自 `nudge` 能力已有的 `nudge_events` 表，不新增写路径

### Modified Capabilities

（无）—— `nudge_events` 表结构不变，`nudge` 能力本身的行为不受影响

## Impact

- `backend/app/routers/interactions.py`（新）：`GET /api/interactions`（列表，支持 `student`/`from`/`to` 过滤）、`GET /api/interactions/count`（最近 7 天条数，侧边栏徽标用）、`GET /api/interactions/students`（有过互动记录的学员列表，筛选器下拉用）
- `backend/app/schemas.py`：新增 `InteractionRead`/`InteractionListRead`/`InteractionCountRead` 等响应 schema
- `frontend/app/(app)/interactions/`（新）：`page.tsx`、`InteractionsClient.tsx`、`types.ts`
- `frontend/app/(app)/students/DetailPanel.tsx`：新增"最近互动"卡片
- `frontend/app/(app)/nudge/NudgeClient.tsx`：既有的"查看互动记录"入口接线到新页面
- `frontend/lib/api.ts`：新增对应的 fetch 封装
- 侧边栏导航组件：新增"互动记录"导航项 + 徽标

## Out of Scope

- 新增互动来源（"答疑"、"人工录入 1:1 沟通"）——应用里目前没有对应的数据模型或录入入口，留给未来单独的 change
- 互动记录的写入/编辑/删除入口——这个页面纯只读
- 导出
- 参与度信号导入（直播观看时长、答题正确率等）——来源未定义，范围更大，不在这轮
