### Contract
- **Spec**:
  - 系统 SHALL 以「学员 × 课程」记录一条报课，并 SHALL 允许指明该学员上哪一场；
    场次 SHALL 可以为空。报课 SHALL 记录报名日期与来源。
  - 系统 SHALL 拒绝为同一 (学员, 课程) 建立**第二条**未指明场次的报课记录。
    (学员, 课程, 场次) 三者相同的记录 SHALL 同样被拒绝。
    这道约束必须由数据库结构保证，不能只在应用层判断。
- **Runtime**: `cd backend && uv run pytest tests/test_enrollments_api.py -q` → expected:
  唯一性四条断言通过（同场次重复被拒、未定场次重复被拒、不同场次并存、不同学员并存）
- **Code**:
  - 存**外键**（`students.email` / `courses.id` / 可空 `course_sessions.id`），不存课程名 ——
    课程名可改，存名字会把历史报课改坏
  - **两条唯一索引，各带 `where`**：`session_id is not null` 一条、`session_id is null` 一条。
    单一索引在 `NULL != NULL` 下会"收下但不冲突"——索引建了却没挡住
  - `session_id` **故意不写 `on delete cascade / set null`**：级联静默带走报课，
    置空静默把人推进待跟进。DB 默认 `no action` 恰好就是拒绝，与应用层守卫一致
  - `source` 列现在就建（只写 `manual`），切片 2 不该改表结构
- **Threshold**: 80
