### Contract
- **Spec**: 讲师 SHALL 能够为某个学员的某门已报课程手动录入一条互动记录，渠道二选一（微信/邮件），内容必填不能为空/纯空白。时间 SHALL 是服务器接收请求时的当前时刻，不接受调用方指定。写入的 `event_type` SHALL 固定为 `manual`，不接受调用方指定。（`specs/interactions/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_interactions.py` → expected: 全部通过，覆盖成功创建/空内容拒绝/非法渠道拒绝/不存在的学员或课程拒绝/`event_type` 不接受调用方覆盖
- **Code**: `backend/app/routers/interactions.py` 新增 `POST /api/interactions`；`backend/app/schemas.py` 新增 `ManualInteractionCreate`（不含 `event_type` 字段，`channel` 用 `Literal["wechat","email"]`，`note` 用 `field_validator` 拒绝空白）；不改 `nudge_events` 表结构（design.md 决定 1、3、4）
- **Threshold**: 80
