### Contract
- **Spec**:
  - 系统 SHALL 只存储两种报课状态：报名与退课。「已完成」SHALL NOT 入库，
    SHALL 在读取时由所属场次派生：无场次或场次未到 → 报名；场次已上 → 已完成；
    场次已取消 → 报名。退课 SHALL 显示为退课，不参与派生，且 SHALL 可以改回报名。
  - 用户 SHALL 通过改这条报课的场次（或清空场次）表达补课，系统 SHALL NOT 提供独立的状态覆盖。
  - 系统 SHALL 同时提供「标记退课」与「删除这条报课」两种动作，二者语义不同。
  - 已下线课程 SHALL NOT 出现在补录选项里；已存在的相关报课 SHALL 照常显示。
- **Runtime**: `cd backend && uv run pytest tests/test_enrollments_api.py -q` → expected:
  派生五态（无场次/未到/已上/已取消/退课）与写入路径（补录、改场次、退课、恢复、删除）全部通过
- **Code**:
  - 派生**复用场次自己的 state**（它已经是派生的：`state_override` 为空即跟随日期，
    "今天"取 `America/Los_Angeles`），不要另算一遍日期 —— 两处各算必然在某个边界分叉
  - 只读响应字段用 `str` 而非 `Literal` —— DB 层没有 CHECK 约束时，
    枚举外的值会让整个列表接口 500 而不是那一行出错
  - `StudentUpdate` 那类哨兵语义：客户端显式传 `null` 要在边界上挡住
- **Threshold**: 80
