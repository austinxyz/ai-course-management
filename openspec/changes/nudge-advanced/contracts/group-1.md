### Contract
- **Spec**: 名单头部摘要行 SHALL 同时显示"未交"人数与"已跳过"人数。没有人被跳过时 SHALL 显示该数字为 0，不是隐藏这一项。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` → expected: 全部通过，覆盖响应形状变化（`items`/`skipped_count`）与跳过人数计算（含 0 人跳过的情形）
- **Code**: `GET /api/nudge?course=` 响应形状从裸数组改成 `{items, skipped_count}`（design.md 决定 4）；`skipped_count` 用一次独立的 `COUNT(DISTINCT student_email)` 查询（course 级别常数次，不随名单人数增长，走 `nudge_events` 既有复合索引），这是对 requirements 原文"零额外往返"的一处已披露偏离，design.md 里写明了原因
- **Threshold**: 80
