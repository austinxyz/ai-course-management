"""驱动脚本的测试：dry-run 真的不写。

这条断言的方式是唯一值得的那种——记录整轮发出的 HTTP method，要求 POST/PATCH 不出现。
"""

import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent))

import import_courses  # noqa: E402

ENV = {"BACKEND_URL": "https://backend.example.com", "BACKEND_SECRET": "fake-secret"}

DATA = {
    "defaults": {
        "duration_minutes": 150,
        "default_tz": "America/New_York",
        "session_time": "20:30",
        "teacher": "Austin Xu",
    },
    "courses": [
        {
            "short": "S1",
            "name": "第一门课",
            "aliases": ["S1", "First Course"],
            "tagline": "定位",
            "intro": "介绍",
            "homework_title": "作业",
            "sessions": [{"date": "2026-06-28"}],
        }
    ],
}


@pytest.fixture
def run(monkeypatch, tmp_path):
    def _run(argv, existing):
        for key, value in ENV.items():
            monkeypatch.setenv(key, value)
        listing = tmp_path / "courses.json"
        listing.write_text(json.dumps(DATA, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(
            sys, "argv", ["import_courses.py", "--file", str(listing), *argv]
        )

        calls: list[tuple[str, str]] = []
        store = list(existing)

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append((request.method, request.url.path))
            assert request.headers["X-Backend-Secret"] == ENV["BACKEND_SECRET"]
            if request.method == "GET":
                return httpx.Response(200, json=store)
            if request.method == "POST" and request.url.path == "/api/courses":
                store.append({"id": "new", "name": "x", "aliases": [], "sessions": []})
                return httpx.Response(201, json={"id": "new"})
            # 契约：PATCH 课程回 200，POST 别名/场次回 201。夹具照抄真实状态码，
            # 否则脚本对状态码的判断会被夹具的宽松掩盖过去。
            if request.method == "PATCH":
                return httpx.Response(200, json={"id": "c-1"})
            return httpx.Response(201, json={})

        transport = httpx.MockTransport(handler)
        real_client = httpx.Client
        monkeypatch.setattr(
            import_courses.httpx, "Client", lambda **kw: real_client(transport=transport, **kw)
        )
        return import_courses.main(), calls, store

    return _run


def test_dry_run_sends_no_writes(run):
    code, calls, store = run([], [])

    assert code == 0
    assert {method for method, _ in calls} == {"GET"}
    assert store == []


def test_apply_creates_the_course_its_aliases_and_sessions(run):
    code, calls, _ = run(["--apply"], [])

    assert code == 0
    posts = [path for method, path in calls if method == "POST"]
    assert posts.count("/api/courses") == 1
    assert sum(1 for p in posts if p.endswith("/aliases")) == 2
    assert sum(1 for p in posts if p.endswith("/sessions")) == 1


def test_apply_updates_the_course_that_already_owns_the_alias(run):
    existing = [{"id": "c-1", "name": "占位名", "aliases": [{"raw": "S1"}], "sessions": []}]

    code, calls, _ = run(["--apply"], existing)

    assert code == 0
    assert ("PATCH", "/api/courses/c-1") in calls
    # 不再建一门同别名的课
    assert ("POST", "/api/courses") not in calls


def test_missing_credentials_abort_before_any_request(monkeypatch):
    monkeypatch.delenv("BACKEND_URL", raising=False)
    monkeypatch.setattr(sys, "argv", ["import_courses.py"])

    with pytest.raises(SystemExit) as exc:
        import_courses.main()

    assert "BACKEND_URL" in str(exc.value)
