### Contract
- **Spec**: 手动录入 SHALL 记录事情性质类型（1:1 沟通/咨询/技术支持/作业反馈四选一）与必填内容，课程 SHALL 由系统自动取该学员未退课报课记录里 `enrolledAt` 最大的一条，没有有效报课时 SHALL 拒绝。参与度信号 SHALL 支持 5 个固定标签立即写入，课程同样自动推导，没有有效报课时 SHALL 拒绝。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖手动录入四类型/参与度信号五标签/课程自动推导（含无有效报课时拒绝）/`channel` 列复用两种含义
- **Code**: `backend/app/schemas.py` 的 `ManualInteractionCreate` 移除 `channel`/`course_id`，改成 `kind: Literal["manual","participation"]` 判别式，`manual` 必须带 `type`（四选一）+`note`（必填非空），`participation` 必须带 `signal`（五选一）；`backend/app/routers/interactions.py` 新增 `_latest_active_course()` 查询（排除 `withdrawn`，按 `enrolled_at` 降序取第一条），写入时 `event_type` 按 `kind` 固定为 `manual`/`participation`，`channel` 列存类型 key 或信号 key（design.md 决定 1、2、4、5）
- **Threshold**: 80
