### Contract
- **Spec**: `send_email(to, subject, body)` 的对外行为不变——失败统一抛 `EmailSendError`，成功无返回值；`nudge.py` 端点逻辑完全不需要改动（只换了 `email_client.py` 内部实现）。测试必须验证不发起真实网络请求。（`specs/nudge/spec.md` 原有要求，实现细节改变不改变 spec）
- **Runtime**: `cd backend && pytest tests/test_email_client.py tests/test_nudge.py` → expected: 全部通过，覆盖 Resend 成功/`RESEND_API_KEY` 未配置/Resend 返回错误状态码/超时参数存在
- **Code**: `email_client.py` 改用 `httpx.post(RESEND_API_URL, ...)`（design.md 决定 2 修订）；`httpx` 从 dev 依赖组提到主依赖（`pyproject.toml`）；测试用 `unittest.mock` 打 `httpx.post`，不发真实网络请求；`nudge.py`/`schemas.py` 不需要改动——`send_email` 签名没变
- **Threshold**: 80
