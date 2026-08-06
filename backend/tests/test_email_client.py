"""SMTP 客户端：`send_email()` 失败统一收成 `EmailSendError`，不冒泡原始异常类型。

测试全程不发真实网络请求——`smtplib.SMTP` 一律 mock 掉。
"""

import smtplib
from unittest.mock import MagicMock, patch

import pytest

from app.email_client import EmailSendError, send_email


def test_raises_when_smtp_credentials_not_configured(monkeypatch):
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)

    with pytest.raises(EmailSendError):
        send_email(to="student@example.com", subject="主题", body="正文")


def _configure_creds(monkeypatch):
    monkeypatch.setenv("SMTP_USER", "austin.aicourse@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password-not-real")


def test_smtp_exception_is_wrapped_as_email_send_error(monkeypatch):
    _configure_creds(monkeypatch)
    mock_server = MagicMock()
    mock_server.send_message.side_effect = smtplib.SMTPException("boom")
    with patch("app.email_client.smtplib.SMTP") as mock_smtp:
        mock_smtp.return_value.__enter__.return_value = mock_server
        with pytest.raises(EmailSendError):
            send_email(to="student@example.com", subject="主题", body="正文")


def test_send_uses_a_timeout(monkeypatch):
    _configure_creds(monkeypatch)
    mock_server = MagicMock()
    with patch("app.email_client.smtplib.SMTP") as mock_smtp:
        mock_smtp.return_value.__enter__.return_value = mock_server
        send_email(to="student@example.com", subject="主题", body="正文")

    _args, kwargs = mock_smtp.call_args
    assert kwargs.get("timeout") == 10
