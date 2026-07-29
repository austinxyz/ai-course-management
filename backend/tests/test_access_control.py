import importlib

from fastapi.testclient import TestClient

from tests.conftest import BACKEND_SECRET, SECRET_HEADER


def test_request_without_shared_secret_is_rejected(anon_client):
    """Anyone can reach this service's URL directly — the shared secret is what
    distinguishes our own Next.js from the rest of the internet."""
    resp = anon_client.get("/api/students")

    assert resp.status_code == 401


def test_request_with_wrong_shared_secret_is_rejected(anon_client):
    resp = anon_client.get("/api/students", headers={SECRET_HEADER: "wrong-secret"})

    assert resp.status_code == 401


def test_request_with_correct_shared_secret_is_served(client):
    resp = client.get("/api/students")

    assert resp.status_code == 200


def test_missing_secret_variable_locks_everyone_out_rather_than_letting_them_in(
    anon_client, monkeypatch
):
    """The failure mode this guards is invisible by hand.

    Written as `if expected and provided != expected`, an unset variable lets
    the whole internet through — and nothing looks wrong: you set a secret
    locally, your requests succeed, the page loads. Only the deployment that
    forgot the variable is wide open, silently. So the direction has to be
    pinned by a test: no secret configured means nobody gets in.
    """
    monkeypatch.delenv("BACKEND_SECRET", raising=False)

    # Even presenting what *was* the correct secret must not help.
    resp = anon_client.get("/api/students", headers={SECRET_HEADER: BACKEND_SECRET})

    assert resp.status_code == 401


def test_api_docs_are_absent_unless_explicitly_enabled(client):
    """/docs and /openapi.json publish the field names (wechat, email, nick) —
    that is, what kind of personal data this system holds. Off by default;
    local development opts in.

    Asserted through the *authenticated* client on purpose. An anonymous
    request is turned away by the secret middleware before routing, so it
    cannot tell "these routes are gone" from "these routes are merely behind
    auth". Getting a 404 while holding a valid secret proves the former.
    """
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_api_docs_are_not_reachable_anonymously_either(anon_client):
    """Belt and braces: whatever the reason (route gone, or auth), an outside
    caller must not receive the schema."""
    assert anon_client.get("/docs").status_code != 200
    assert anon_client.get("/openapi.json").status_code != 200
