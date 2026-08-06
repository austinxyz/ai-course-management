"""Resend HTTP API 客户端：`send_email()` 失败统一收成 `EmailSendError`，不冒泡
`httpx` 的具体异常类型。SMTP 方案被 Render 免费档出站封锁（生产实测
`[Errno 101] Network is unreachable`），改走 HTTPS API（design.md 决定 2 修订）。

测试全程不发真实网络请求——`httpx.post` 一律 mock 掉。
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.email_client import EmailSendError, send_email


def test_raises_when_api_key_not_configured(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    with pytest.raises(EmailSendError):
        send_email(to="student@example.com", subject="主题", body="正文")


def _configure_key(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_not_real")


def test_success_posts_to_resend_with_bearer_auth(monkeypatch):
    _configure_key(monkeypatch)
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    with patch("app.email_client.httpx.post", return_value=mock_response) as mock_post:
        send_email(to="student@example.com", subject="主题", body="正文")

    args, kwargs = mock_post.call_args
    assert args[0] == "https://api.resend.com/emails"
    assert kwargs["headers"]["Authorization"] == "Bearer re_test_not_real"
    assert kwargs["json"]["to"] == ["student@example.com"]


def test_error_status_is_wrapped_as_email_send_error(monkeypatch):
    _configure_key(monkeypatch)
    mock_response = MagicMock()
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "400", request=MagicMock(), response=MagicMock()
    )
    with patch("app.email_client.httpx.post", return_value=mock_response):
        with pytest.raises(EmailSendError):
            send_email(to="student@example.com", subject="主题", body="正文")


def test_send_uses_a_timeout(monkeypatch):
    _configure_key(monkeypatch)
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    with patch("app.email_client.httpx.post", return_value=mock_response) as mock_post:
        send_email(to="student@example.com", subject="主题", body="正文")

    _args, kwargs = mock_post.call_args
    assert kwargs.get("timeout") == 10
