from urllib.parse import urlsplit

import pytest

from app.db import normalize_database_url, resolve_database_url


def test_missing_database_url_fails_loudly_instead_of_falling_back_to_localhost(monkeypatch):
    """A deployed service with no DATABASE_URL must not quietly aim at 127.0.0.1.

    That fallback turns a deploy-time misconfiguration into a per-request 500
    whose log line ("connection refused to 127.0.0.1") is baffling in a cloud
    environment. Fail at startup, and say what to do about it.
    """
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError) as excinfo:
        resolve_database_url()

    message = str(excinfo.value)
    assert "DATABASE_URL" in message
    assert ".env.example" in message  # tell the reader how to fix it


def test_resolve_normalizes_the_configured_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/db")

    assert resolve_database_url() == "postgresql+psycopg://u:p@h:5432/db"


def test_supabase_console_url_gets_psycopg_driver():
    """Supabase 控制台给的是 postgresql:// —— SQLAlchemy 见此会去找未安装的 psycopg2。"""
    assert (
        normalize_database_url("postgresql://u:p@h:5432/db")
        == "postgresql+psycopg://u:p@h:5432/db"
    )


def test_legacy_postgres_scheme_gets_psycopg_driver():
    """`postgres://` 是旧式写法，SQLAlchemy 自身已不再接受，同样需要归一化。"""
    assert (
        normalize_database_url("postgres://u:p@h:5432/db")
        == "postgresql+psycopg://u:p@h:5432/db"
    )


def test_already_pinned_url_is_returned_unchanged():
    """本地开发用的写法已带驱动，不得被二次改写成 postgresql+psycopg+psycopg://。"""
    url = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    assert normalize_database_url(url) == url


def test_only_the_scheme_changes():
    """归一化只影响驱动选择 —— 凭证、主机、端口、库名必须逐项不变。"""
    original = urlsplit("postgresql://user:pa55@db.example.com:6543/students")
    normalized = urlsplit(normalize_database_url("postgresql://user:pa55@db.example.com:6543/students"))

    assert normalized.username == original.username == "user"
    assert normalized.password == original.password == "pa55"
    assert normalized.hostname == original.hostname == "db.example.com"
    assert normalized.port == original.port == 6543
    assert normalized.path == original.path == "/students"
