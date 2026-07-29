from sqlmodel import delete

from app.models import Student


def test_list_students_returns_seeded_data(client):
    resp = client.get("/api/students")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 10

    fields = {
        "email", "name", "wechat", "wx_name", "nick", "region", "tz",
        "level", "source", "tags", "note", "gender", "age", "industry",
    }
    for row in body:
        assert fields.issubset(row.keys())

    lin_min = next(r for r in body if r["email"] == "lin.min@example.com")
    assert lin_min["wechat"] == ""


def test_list_students_empty_db_returns_empty_array(client, db_session):
    db_session.exec(delete(Student))

    resp = client.get("/api/students")

    assert resp.status_code == 200
    assert resp.json() == []


def test_get_student_by_email_case_insensitive(client):
    resp = client.get("/api/students/CHEN.JIAHE@EXAMPLE.COM")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "chen.jiahe@example.com"
    assert body["name"] == "陈嘉禾"
    assert body["tz"] == "UTC-8"


def test_get_student_not_found(client):
    resp = client.get("/api/students/nobody@example.com")
    assert resp.status_code == 404
