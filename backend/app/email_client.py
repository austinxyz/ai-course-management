"""Resend HTTP API 客户端：只暴露一个纯函数 `send_email()`。

原本用 SMTP（`smtplib`）——被 Render 免费档的出站端口封锁挡死，生产实测
`smtp.gmail.com:587` 连不上（`[Errno 101] Network is unreachable`），换账号/
密码都没用。改走 Resend 的 HTTPS API，走 443 端口，不受这条封锁影响
（`nudge-email-send` design.md 决定 2 修订）。

失败统一收成 `EmailSendError`——调用方（`routers/nudge.py`）不需要关心
`httpx` 抛的具体异常类型，只需要区分"发出去了"和"没发出去"。测试用
`unittest.mock.patch("app.email_client.httpx.post")` 整体替换，从不真的
连网络（`CLAUDE.md` 硬性要求：涉及发送邮件的功能测试中不能真实发信）。
"""

import os

import httpx


class EmailSendError(Exception):
    """Resend API 层面的任何失败——未配置密钥、鉴权失败、请求超时、4xx/5xx——
    统一收成这一种。"""


RESEND_API_URL = "https://api.resend.com/emails"
# 需要在 Resend 后台验证过 austinxyz.ai 的 DNS 记录，否则 Resend 只允许发到
# 账号自己的邮箱——那样对催学员这个场景没有意义。
FROM_ADDRESS = "noreply@austinxyz.ai"


def send_email(to: str, subject: str, body: str) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise EmailSendError("RESEND_API_KEY 未配置")

    try:
        # timeout=10——不留无限等待的口子，这条路径涉及外部依赖必须有超时。
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"from": FROM_ADDRESS, "to": [to], "subject": subject, "text": body},
            timeout=10,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise EmailSendError(str(exc)) from exc
