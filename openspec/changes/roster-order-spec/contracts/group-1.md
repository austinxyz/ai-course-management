### Contract
- **Spec**:
  - `GET /api/students` SHALL 按**姓名升序**返回学员，并 SHALL 以**邮箱**作为姓名相同时的兜底键。
    排序 SHALL 由服务端决定并体现在响应顺序里；顺序 SHALL NOT 随任何写入而改变。
    本规则同时适用于在读名单与已归档名单——同一个端点，同一条规则。
- **Runtime**: `cd backend && uv run pytest tests/test_students_api.py -q` → expected: 既有 100+ 项
  **原样通过**（本 change 不改代码，任何失败都说明动到了不该动的东西）；
  另须确认 `git diff` 在 `backend/` 下**只含新增测试**、`frontend/` 下为空（生产代码零改动）
- **Code**:
  - **不改生产代码。** 实现（`backend/app/routers/students.py:46`）已存在；测试可补，且补出来的测试须按规矩故意改错实现确认真会红
  - Scenario 必须对应既有测试，**不新造没有测试支撑的断言** —— 那会让 spec 显得比实际覆盖得多
  - 用 ADDED 而非 MODIFIED 既有的「学员列表查询」（那条讲字段，与顺序是两件事；
    合并会让两个断言绑在同一 header 上，而 archive 按标题匹配 MODIFIED）
- **Threshold**: 80
