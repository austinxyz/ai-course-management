"""SMTP 客户端：只暴露一个纯函数 `send_email()`。

失败统一收成 `EmailSendError`——调用方（`routers/nudge.py`）不需要关心 smtplib
抛的具体异常类型，只需要区分"发出去了"和"没发出去"。测试用
`unittest.mock.patch("app.routers.nudge.send_email")` 整体替换这个函数，
从不真的连网络（`CLAUDE.md` 硬性要求：涉及发送邮件的功能测试中不能真实发信）。
"""

import os
import smtplib
from email.message import EmailMessage


class EmailSendError(Exception):
    """SMTP 层面的任何失败——未配置凭证、鉴权失败、连接超时——统一收成这一种。"""


def send_email(to: str, subject: str, body: str) -> None:
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    if not user or not password:
        raise EmailSendError("SMTP_USER/SMTP_PASSWORD 未配置")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = user
    message["To"] = to
    message.set_content(body)

    try:
        # timeout=10——不留无限等待的口子，这条路径涉及外部依赖必须有超时。
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(user, password)
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailSendError(str(exc)) from exc
