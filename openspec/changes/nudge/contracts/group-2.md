### Contract
- **Spec**: 讲师标记已催 SHALL 写入一条 `nudge_events`（类型 `nudged`），SHALL NOT 把学员从名单移除；渠道 SHALL 按微信是否对齐自动判定，SHALL NOT 提供人工选择渠道的接口。跳过 SHALL 写入一条 `nudge_events`（类型 `skipped`）并让该（学员,课程）从后续查询的名单中被排除，SHALL NOT 修改 `homework_submissions`/`enrollments` 的既有数据。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py` → expected: 全部通过，覆盖标记已催写入记录且不移除/渠道自动判定/跳过后从名单排除/跳过不改动其余表
- **Code**: `POST /api/nudge/events` 接收 `{student_email, course_id, event_type, note?}`；渠道在服务端算（查 `Student.wechat` 是否非空），不接受请求体传入渠道（design.md 决定 4）；跳过的过滤直接加在 1.4 的查询 `WHERE NOT EXISTS (... skipped ...)` 里，不是应用层二次过滤
- **Threshold**: 80
