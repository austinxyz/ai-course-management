### Contract
- **Spec**: 详情面板确认后 SHALL 通过 SMTP 把草稿发到该学员邮箱，主题固定 `《{课程名}》作业提醒`。发送成功 SHALL 自动记一条 `channel=email` 的 `nudged` 事件，SHALL NOT 经过 `_channel_for()` 自动判定。发送失败 SHALL 就地报错，SHALL NOT 记录任何事件。SMTP 调用路径必须有超时与异常路径的测试，测试必须验证不会真实发信。（`specs/nudge/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_nudge.py tests/test_email_client.py` → expected: 全部通过，覆盖发送成功写入 email 渠道事件/发送失败不写入/SMTP 未配置报错/超时参数存在
- **Code**: 新增 `backend/app/email_client.py::send_email()`，失败统一抛 `EmailSendError`，`smtplib.SMTP(..., timeout=10)`（design.md 决定 2）；新端点 `POST /api/nudge/send-email` 直接写 `NudgeEvent(channel="email")`，不经过 `_channel_for`（design.md 决定 1/3）；测试用 `unittest.mock.patch("app.routers.nudge.send_email")` 整体替换，不发真实网络请求
- **Threshold**: 80
