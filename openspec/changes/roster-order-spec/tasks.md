## 1. 补写排序需求（无代码改动）

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

- [x] 1.0 CONTRACT — write openspec/changes/roster-order-spec/contracts/group-1.md with the ### Contract block above
- [x] 1.1 验证既有测试确实覆盖两条 Scenario —— 逐条比对 `test_list_order_is_stable_across_an_edit`
      与 `test_list_order_breaks_name_ties_deterministically` 的断言，确认 spec 里的两条
      Scenario 不是凭空写的；若有 Scenario 找不到对应测试，**删掉它或补测试**，二选一
- [x] 1.2 跑 `cd backend && uv run pytest` 确认原样通过
- [x] 1.3 确认 `git diff --stat backend frontend` **只含新增测试** —— 生产代码零改动。
      （原计划是"完全为空"。1.1 的比对发现需求里「在读与已归档同规则」这句没有测试覆盖，
      两条约束冲突时以"spec 不许声称未被测试的行为"优先：补了
      `test_archived_list_uses_the_same_order`，并按规矩把 `order_by` 故意改错、
      确认三条排序测试都真的会红，再恢复。）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 验证

- [ ] 2.1 Run backend test suite — `cd backend && uv run pytest`
- [ ] 2.2 前端测试与构建 —— 本 change 不碰前端，跑一遍确认无意外
- [ ] 2.3 无需上线 —— 纯文档，不部署、不迁移
