### Contract
- **Spec**: `InteractionRead` SHALL 暴露记录的 `id`。`DELETE /api/interactions/{id}` SHALL 删除 `event_type` 为 `manual`/`participation` 的记录；对 `nudged`/`skipped`/`unskipped` 类型的删除请求 SHALL 拒绝（422），不论请求是否来自前端界面。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖列表响应带 `id`/删除人工录入成功/删除参与度信号成功/拒绝删除自动事件/删除不存在的记录返回 404
- **Code**: `backend/app/schemas.py` 的 `InteractionRead` 新增 `id: uuid.UUID`；`backend/app/routers/interactions.py` 的 `list_interactions` 附带 `id`，新增 `DELETE /api/interactions/{id}`，删除前查记录、校验 `event_type` 在允许集合里才执行删除，不在集合里返回 422（design.md 决定 1、2）
- **Threshold**: 80
