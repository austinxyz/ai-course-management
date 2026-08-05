### Contract
- **Spec**: 催作业名单 SHALL 只含 `homework` 能力判定为"未交"（missing）状态的学员，SHALL NOT 含"未开放"/"未定场次"。逾期天数 SHALL 以所报场次的上课日期为基准；同一学员同一门课多条未交报课记录 SHALL 只算一条，取最早场次日期。名单查询 SHALL 一次请求返回名单+统计+催促历史（`history` 数组，按时间倒序），SHALL NOT 逐人二次请求。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` → expected: 全部通过，覆盖未交判定复用/逾期天数计算/同人多条记录去重/一次查询取全（含空历史时的"还没催过"占位）
- **Code**: 新建 `backend/app/routers/nudge.py`，从 `app.routers.homework` 导入 `merge_states`/`state_of`/`MISSING`/`SUBMITTED` 复用状态判定（design.md 决定 1）；`nudge_events` 表 migration（design.md 决定 2，`event_type` 不建 CHECK 约束、给未来扩展留口子，仿 `homework.source` 的先例）；`GET /api/nudge?course=` 用 `json_agg` 子查询把 `history` 嵌进主查询（design.md 决定 3），不新增 `session.exec` 调用
- **Threshold**: 80
