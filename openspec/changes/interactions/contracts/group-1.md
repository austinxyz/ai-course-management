### Contract
- **Spec**: 系统 SHALL 提供一个独立页面展示全部学员的互动历史，数据源 `nudge_events`，按时间倒序。侧边栏"互动记录"数字徽标 SHALL 显示最近 7 天互动条数，没有记录时 SHALL 显示 0。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖列表按时间倒序/JOIN 出学员姓名与课程名/最近 7 天计数含 0 条边界
- **Code**: 新增 `backend/app/routers/interactions.py`：`GET /api/interactions` 全量返回（JOIN `students`+`courses`，不接受任何过滤参数，design.md 决定 1）；`GET /api/interactions/count` 固定"最近 7 天"窗口、不接受参数；`backend/app/schemas.py` 新增 `InteractionRead`/`InteractionListRead`/`InteractionCountRead`
- **Threshold**: 80
