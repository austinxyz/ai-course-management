### Contract
- **Spec**: `GET /api/enrollments` 的每一条记录 SHALL 附带该学员在这门课的作业提交总分（`homework_total`），没有提交记录时该字段 SHALL 为 `null`。该字段 SHALL 在既有的一条 JOIN 语句里取得，SHALL NOT 增加应用层的数据库往返次数。同一学员对同一门课有多条报课记录时，各条记录的 `homework_total` SHALL 相同。（`specs/enrollment/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_enrollments_api.py` → expected: 全部通过，新增用例覆盖有提交/无提交/重复报名三种情形，无既有用例回归
- **Code**: `list_enrollments` 的 `select()` 加一个 `HomeworkSubmission` 的 outerjoin（`(student_email, course_id)` 唯一键，1:1 安全无笛卡尔积，与 `homework.py::list_homework` 已验证过的同款 JOIN 模式一致）；`_to_read` 签名加 `submission: HomeworkSubmission | None` 参数；`EnrollmentRead` 新增 `homework_total: int | None`；不新增 `session.exec` 调用
- **Threshold**: 80
