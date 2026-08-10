## Context

学员详情页（`frontend/app/(app)/students/EnrollmentRows.tsx`）展示报课记录，数据来自 `GET /api/enrollments`（`backend/app/routers/enrollments.py::list_enrollments`）——一条 JOIN（`Enrollment ⋈ Course ⋈ CourseSession`）取全，不做逐条二次查询。作业成绩在 `homework_submissions` 表，唯一键 `(student_email, course_id)`，此前只有 `/homework` 页读取它。

`/homework` 页（`HomeworkClient.tsx`）的学员选中状态是纯前端 `useState<string | null>(null)`，不在 URL 里。

## Goals / Non-Goals

**Goals:**
- `GET /api/enrollments` 在同一条 SQL 里带出该报课对应课程的作业总分，不增加往返
- 学员详情页报课卡片加一行「作业」概要（已交 N 分 / 未交），可点击跳转
- `/homework` 页支持 `?student=` 深链接直接展开详情面板

**Non-Goals:**
- 不复用 `/homework` 页四态判定逻辑（那套逻辑要合并报课记录多场次状态，本处只是"有没有 `homework_submissions` 行"这个更简单的事实）
- 不新增数据库表或列——`homework_total` 是查询时算出的只读投影，不落库

## Decisions

**1. `list_enrollments` 的 JOIN 再加一次 outerjoin，不新增 `session.exec` 调用。**

```python
statement = (
    select(Enrollment, Course, CourseSession, HomeworkSubmission)
    .join(Course, Course.id == Enrollment.course_id)
    .outerjoin(CourseSession, CourseSession.id == Enrollment.session_id)
    .outerjoin(
        HomeworkSubmission,
        (HomeworkSubmission.student_email == Enrollment.student_email)
        & (HomeworkSubmission.course_id == Enrollment.course_id),
    )
)
```

安全性与 `homework.py::list_homework` 的同款 JOIN 同一个论证：`(student_email, course_id)` 是 `homework_submissions` 的唯一键，每条报课至多匹配一行，不产生笛卡尔积。`_to_read` 签名加一个 `submission: HomeworkSubmission | None` 参数，取 `submission.total if submission else None`。

备选：单独一次 `GET /api/homework/submissions?student=` 查询，前端拼装。放弃——多一次往返，且报课记录本来就该是自足的一条记录，不该依赖前端做两次请求的合并。

**2. `EnrollmentRead` 新增 `homework_total: int | None`，`Enrollment`（前端类型）新增 `homeworkTotal`。**

字段命名跟现有 `total_max`（homework 那边）保持同一种蛇形/驼峰映射习惯，`frontend/lib/api.ts` 的 enrollments 映射函数加一行。

**3. `EnrollmentRow` 新增一行，复用现有 `font-mono text-[11px] text-muted-foreground` 规格（跟场次/报名日期那一行同一套）；「已交 N 分」用 `text-primary` 链接色，「未交」用 `text-muted-foreground` 纯文字，两者都是 `<a href>`，不是 `<button>`——是导航不是操作。**

链接目标 `/homework?course=${courseId}&student=${encodeURIComponent(studentEmail)}`。

**4. `/homework` 页深链接：`page.tsx` 读 `searchParams.student`，作为 prop 传给 `HomeworkClient`；`HomeworkClient` 的 `selected` 状态初始值改为该 prop（默认 `null`），不做校验——如果这个邮箱不在当前课程名单里，`rows.find(...)` 天然返回 `null`，详情面板不展开，不需要额外的"不存在"处理分支。**

备选：后端校验 `student` 是否在该课程名单里，无效则 400。放弃——这是一个纯展示层的深链接参数，不是写操作，无效值最坏后果是"没有自动展开"，不值得为它加一条校验路径。

## Risks / Trade-offs

- **[风险] `list_enrollments` 的 JOIN 从 3 表增加到 4 表，理论上查询变慢** → 缓解：`homework_submissions` 按 `(student_email, course_id)` 有唯一索引（迁移里的唯一约束天然建了索引），这次 outerjoin 走索引查找，不是全表扫描；跟 `homework.py::list_homework` 已经在生产验证过的同款 JOIN 模式一致。
- **[风险] 深链接的 `student` 参数可以是任意字符串（比如拼错的邮箱）** → 接受：前端只做本地查找，找不到就是"不自动展开"，不是错误状态；不做服务端校验（见 Decision 4）。

## Migration Plan

无数据库变更——`homework_total` 是查询时投影的字段，不新增列。部署即生效，无需回填、无需回滚步骤。

## Open Questions

（无——探索阶段已定：二态简化、自动选中、跳转带 `student` 参数）
