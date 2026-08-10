---
Date: 2026-08-03
Change: student-homework-summary
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-08-03-student-homework-summary-requirements.md
---

## Why

讲师在学员详情页翻报课记录时，想顺手看一眼"这门课他交了没、大概多少分"，不用切到 `/homework` 页按课程翻名单去找人。作业成绩已经在库里（`homework_submissions`），只是学员详情页从没读取过。

## What Changes

- `GET /api/enrollments` 的既有 JOIN 里加一个左连接，带出该报课对应的 `homework_submissions.total`（同一条 SQL，不增加数据库往返）。
- 学员详情页「报课记录」每一行新增一行「作业」概要：有提交显示「已交 · N 分」（链接），没有显示「未交」（同样可点）。
- 点击跳转 `/homework?course=<courseId>&student=<email>`；`/homework` 页新增 `student` query 参数，读取后作为详情面板的初始选中值（此前是纯前端 `useState(null)`）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `enrollment` —— `EnrollmentRead` 新增只读字段 `homework_total`，`GET /api/enrollments` 的 JOIN 结构扩展但往返次数不变
- `homework` —— `/homework` 页支持 `?student=` 深链接，加载时自动选中对应学员的详情面板

## Impact

- `backend/app/routers/enrollments.py`：`list_enrollments` 查询语句、`_to_read` 映射函数
- `backend/app/schemas.py`：`EnrollmentRead` 新增字段
- `frontend/app/(app)/students/types.ts`：`Enrollment` 类型新增字段
- `frontend/app/(app)/students/EnrollmentRows.tsx`：渲染新增一行
- `frontend/lib/api.ts`：`getEnrollments`（或等价函数）的蛇形→驼峰映射
- `frontend/app/(app)/homework/page.tsx`：读取 `student` searchParam
- `frontend/app/(app)/homework/HomeworkClient.tsx`：`selected` 初始值来自 prop 而非恒为 `null`

## Out of Scope

- 不复用 `/homework` 页的四态（已交/未交/未开放/未定场次）——学员详情页只做二态简化
- 不在学员详情页展示分项、亮点、改进建议、批改报告——这些仍然只在 `/homework` 页看
- 不新增编辑入口
