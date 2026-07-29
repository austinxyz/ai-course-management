"""Tests for the import driver.

The claim that matters here is "dry-run does not write". It is asserted the
only way that is worth anything: by recording every HTTP method the run issues
and requiring that POST is not among them.

Notion and the backend are both stubbed — no network (CLAUDE.md §测试规则).
All fixture data is fictional.
"""

import json
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent))

import import_students  # noqa: E402
from test_mapping import make_page  # noqa: E402

ENV = {
    "NOTION_API_KEY": "fake-notion-token",
    "BACKEND_URL": "https://backend.example.com",
    "BACKEND_SECRET": "fake-secret",
}


class FakeNotion:
    def __init__(self, pages: list[dict[str, Any]]):
        self.databases = self
        self._pages = pages

    def query(self, database_id: str, start_cursor: str | None = None):
        return {"results": self._pages, "has_more": False, "next_cursor": None}


@pytest.fixture
def run(monkeypatch):
    """Run main() against stubs. Returns (exit_code, calls, stored_emails)."""

    def _run(argv: list[str], pages: list[dict[str, Any]], existing: list[str]):
        for key, value in ENV.items():
            monkeypatch.setenv(key, value)
        monkeypatch.setattr(sys, "argv", ["import_students.py", *argv])
        monkeypatch.setattr(import_students, "Client", lambda auth: FakeNotion(pages))

        calls: list[tuple[str, str]] = []
        stored = {e.lower() for e in existing}

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append((request.method, request.url.path))
            assert request.headers["X-Backend-Secret"] == ENV["BACKEND_SECRET"]
            if request.method == "GET":
                archived = request.url.params.get("archived", "").lower() == "true"
                rows = [] if archived else [{"email": e} for e in sorted(stored)]
                return httpx.Response(200, json=rows)
            email = json.loads(request.content)["email"].lower()
            if email in stored:
                return httpx.Response(409, json={"detail": "email already exists"})
            stored.add(email)
            return httpx.Response(201, json={"email": email})

        transport = httpx.MockTransport(handler)
        real_client = httpx.Client

        def client_factory(**kwargs):
            return real_client(transport=transport, **kwargs)

        monkeypatch.setattr(import_students.httpx, "Client", client_factory)
        return import_students.main(), calls, stored

    return _run


def test_dry_run_issues_no_write_requests(run):
    pages = [make_page(name="甲", email="a@example.com")]
    code, calls, stored = run([], pages, existing=[])
    assert code == 0
    assert {method for method, _ in calls} == {"GET"}
    assert stored == set()


def test_apply_creates_the_mappable_records(run):
    pages = [
        make_page(name="甲", email="a@example.com"),
        make_page(name="乙", email="b@example.com"),
        make_page(name="无邮箱", email=None),
    ]
    code, calls, stored = run(["--apply"], pages, existing=[])
    assert code == 0
    assert sum(1 for method, _ in calls if method == "POST") == 2
    assert stored == {"a@example.com", "b@example.com"}


def test_rerun_skips_existing_and_creates_nothing(run):
    pages = [make_page(name="甲", email="a@example.com")]
    code, _, stored = run(["--apply"], pages, existing=["a@example.com"])
    assert code == 0
    assert stored == {"a@example.com"}


def test_missing_credentials_abort_before_any_request(monkeypatch):
    monkeypatch.delenv("NOTION_API_KEY", raising=False)
    monkeypatch.setattr(sys, "argv", ["import_students.py"])
    with pytest.raises(SystemExit) as exc:
        import_students.main()
    assert "NOTION_API_KEY" in str(exc.value)
