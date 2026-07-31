---
Date: 2026-07-30
Change: enrollment-core
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-30-enrollment-core-requirements.md
---

## Why

`student-roster` 与 `course-catalog` 都已上线，但**互不相干** —— 系统里没有任何东西把
"这个人"和"这门课"连起来。课程页的场次卡片因此不显示「已报 N 人」（没有报课表时，
0 是一个谎），学员详情里没有报课区块，而催作业（`docs/requirements.md` §4.4，核心工作流）
要回答的"这门课谁没交作业"更是无从谈起 —— 它的第一个前提就是"这门课有谁"。

另有一笔到期的账：**场次目前是硬删除**。`course-catalog` 归档时记下"现在没有报课表所以无害，
有了之后删掉一场会让报课记录指向不存在的场次"。本 change 一并了结。

## What Changes

- 新表 `enrollments`：`students.email` × `courses.id` × 可空的 `course_sessions.id`，
  带 `enrolled_at`、`status`、`source`、`note`
- 状态只存 `enrolled` / `withdrawn`；**「已完成」不入库**，读取时由所属场次派生
- 唯一键 (邮箱, 课程, 场次)，**外加 partial unique index** —— `NULL != NULL`，
  普通唯一索引挡不住重复的"未定场次"行
- `GET/POST/PATCH/DELETE /api/enrollments`（补录、改场次、退课/恢复、删除录错的记录）
- **BREAKING**：`DELETE /api/courses/{id}/sessions/{sid}` 在有报课记录指向该场次时返回 409。
  此前无条件删除
- 课程页场次卡片显示「已报 N 人」（状态 ≠ 退课的条数）
- 学员详情新增「报课记录」区块 + 手工补录弹窗

## Capabilities

### New Capabilities

- `enrollment` —— 报课记录本身：挂载方式、状态派生、唯一性、计数规则，
  以及"作业按人去重"这条对下游（作业/催作业）的约束

### Modified Capabilities

- `course-catalog` —— 两处：
  - MODIFIED「场次可排，每场独立讲师」：其 Scenario「修改与删除场次」当前写的是
    "删除后该场不再出现"，无条件成立；有了报课之后不再无条件。整块复制该需求再改那条 Scenario，
    标题不变
  - ADDED「场次显示已报人数」。查证过：`openspec/specs/course-catalog/spec.md` 里**没有**
    任何「已报 N 人」条款（"不显示"那句只在 `openspec/specs/README.md` 的能力清单里，
    那是文档不是 spec），所以是纯 ADDED，不需要 REMOVED
- `student-roster` —— ADDED 学员详情的报课区块。既有需求不变

## Impact

- 新 migration：`enrollments` 表 + 两个唯一索引（普通 + partial）
- `backend/app/models.py`、`schemas.py`、新 `routers/enrollments.py`
- `backend/app/routers/courses.py` —— 场次删除加守卫；课程读取带上每场的报课人数
- `frontend/lib/api.ts`、`frontend/app/(app)/students/DetailPanel.tsx` + 新补录弹窗、
  `frontend/app/(app)/courses/SessionRows.tsx`
- **报课页那个 tab 仍是占位页** —— 补录入口在学员详情

## Out of Scope

- **批量导入**（CSV / 手工粘贴 / API 拉取）、报课总表页、待处理队列、`raw_payload` 留档
  —— 全部归 `enrollment-import`
- **API 拉取适配器** —— 阻塞于 EliteCoach101 是否开放接口（设计稿标为"待确认"）
- **作业与催作业**（§4.3 / §4.4）—— 本 change 只为它们定好口径（作业按人去重）
- **出勤记录**（来没来）—— 不跟踪
- **批量改派场次** —— 删场次时只做"拒绝"，不提供顺手改派
- **退款、收费、名额上限** —— 重复听课目前不额外收费，也不设名额
