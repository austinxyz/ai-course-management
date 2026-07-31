### Contract
- **Spec**:
  - 某场次的已报人数 SHALL 为指向该 (课程, 场次) 且状态不是退课的报课条数。
    学员是否已归档 SHALL NOT 影响该计数。
  - 有人报名的场次 SHALL 显示其已报人数；**无人报名时 SHALL 不显示该数字**。
    课程 SHALL 另外呈现"未定场次"的人数，为零时 SHALL 不显示。
  - **删除场次 SHALL 在有报课记录指向该场次时被拒绝**，并告知有多少条挡着。
    退课的报课记录 SHALL 同样阻止删除。
  - 一门课的报课**人数** SHALL 按学员去重。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_api.py tests/test_enrollments_api.py -q`
  → expected: 计数（退课减一、归档不减、去重人数）与删除守卫（409 + 条数、退课记录同样挡住）通过；
  既有课程测试无回归
- **Code**:
  - 计数在 `GET /api/courses` 同一次请求里聚合（场次已经取回内存归拢过，避免 N+1），
    不新开端点；"未定场次人数"按 `course_id` 聚合 `session_id is null`
  - 409 的 `detail` 要带**条数**，前端 `describeDetail()` 已能渲染
  - 归档学员**不排除**在计数外 —— 排除会让历史数字随今天的操作被改写
- **Threshold**: 80
