---
Date: 2026-08-03
Change: student-homework-summary
Status: REVIEWED
HAS_UI_SURFACE: no
---

## Goals

- 学员详情页的「报课记录」每一行，附带这门课的作业情况概要：已交（总分）/ 未交。
- 点击可跳转到 `/homework` 页对应课程，并自动展开该学员的详情面板，看完整信息（分项、亮点、改进建议、逐分项评语等）。
- 不新增数据库往返：复用 `GET /api/enrollments` 现有的一条 JOIN，加一个左连接取 `homework_submissions.total`。

## Non-Goals

- 不复用 `/homework` 页的四态（已交/未交/未开放/未定场次）——简化成二态（已交 X 分 / 未交），不区分"没交是因为场次还没上"还是"真的没交"。想看原因跳 `/homework` 页。
- 不在学员详情页展示分项、亮点、改进建议、回复状态、批改报告——这些仍然只在 `/homework` 页详情面板看。
- 不做编辑入口——学员详情页这一处纯只读，跟"报课记录"卡片其余字段的只读部分一致（写操作走各自页面）。
- 不改变现有报课记录卡片的其余交互（改场次/删除/退课标签）。

## Constraints

- `GET /api/enrollments` 目前是**一条 JOIN 取全**（Enrollment ⋈ Course ⋈ CourseSession），不能退化成"报课列表 + 逐条查作业"的 N+1；新增的作业总分必须挂在同一条 SQL 语句里（标量子查询或再 LEFT JOIN 一次），不增加应用层的 `session.exec` 调用次数。
- `homework_submissions` 唯一键是 `(student_email, course_id)`，跟 `Enrollment` 关联安全（1:1，不产生笛卡尔积）。
- `/homework` 页当前的学员选中状态是纯前端 `useState`（不在 URL 里）。要支持"深链接直接展开某学员"，需要新增一个 URL query 参数（如 `?student=<email>`），`HomeworkClient` 用它做初始选中值。

## Success Criteria

- 学员详情页某条报课记录，若该学员这门课有提交记录，显示"已交 · 总分"；没有则显示"未交"。
- 点击该行的作业概要（或旁边一个链接/按钮），跳转到 `/homework?course=<courseId>&student=<email>`，落地即看到该学员的详情面板已展开。
- `GET /api/enrollments`（学员详情页用的那次调用）往返次数不变。
- 作业概要**不因报课状态（报名/已完成/退课）而隐藏**——退课记录照样显示这门课当时的作业情况，跟其余字段（场次、来源）一样是历史事实的展示，不做过滤。
- 同一学员对同一门课有多条报课记录时（重复报名），两条记录显示的作业总分相同——`homework_submissions` 按「学员+课程」记一份，跟"作业按人计不按报课记录计"的既有口径一致，不是 bug。

## User Stories

- 作为讲师，我在学员详情页翻某个学员的报课记录，想顺手看一眼"这门课他交了没、大概多少分"，不用切到 `/homework` 页按课程翻名单去找他。
- 我想看某门课的详细批改内容（分项、亮点、改进建议）时，点一下就能跳过去、还不用重新在名单里找人。

## Open Questions

（无——探索阶段已定：二态简化、自动深链选中）

## UI Description

不新增视觉设计，纯文字描述、跳过 mock 环节（改动完全落在 `EnrollmentRows.tsx` 既有卡片结构内，复用既有 token）：

`EnrollmentRow`（`frontend/app/(app)/students/EnrollmentRows.tsx`）现有第一行是课程名 + 场次/报名日期/来源，右侧是状态徽章（报名/已完成/退课）+ 改场次/删除按钮。新增一行，放在场次/报名日期那一行下面：

- 有提交：`作业 已交 · 77 分`，"77 分"是链接样式（复用 `text-primary`，跟页面其余可点文字一致），点击跳转 `/homework?course=<courseId>&student=<email>`
- 无提交：`作业 未交`，纯文字（`text-muted-foreground`），同样可点击跳转（未交也想看是不是场次还没到）
- 字号/间距跟随现有 `font-mono text-[11px]` 那一行（场次/报名日期用的规格），不引入新样式

`/homework` 页（`HomeworkClient.tsx`）改动：`page.tsx` 读取新增的 `?student=` query 参数，作为 `HomeworkClient` 的初始选中值（目前 `selected` 是纯前端 `useState(null)`，改成 `useState(initialSelectedEmail)`）。

## Referenced Capabilities

- `enrollment`（`openspec/specs/enrollment/spec.md`）—— `GET /api/enrollments` 的 JOIN 结构、`EnrollmentRead` schema
- `homework`（`openspec/specs/homework/spec.md`）—— `homework_submissions` 表、`/homework` 页详情面板
