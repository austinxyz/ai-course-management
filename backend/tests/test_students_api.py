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


def test_list_order_is_stable_across_an_edit(client, db_session):
    """Without an ORDER BY, Postgres hands back rows in heap order, and an
    UPDATE writes a new tuple at the end of the heap — so editing a student
    moved them to the bottom of the roster. The order has to be a property of
    the data, not of when a row was last written.

    ASCII names only: which side of `Helen` a Chinese name lands on depends on
    the database collation, and that is not what this test is about.
    """
    db_session.exec(delete(Student))
    emails = ["b@example.com", "c@example.com", "a@example.com"]
    for email, name in zip(emails, ["Bravo", "Charlie", "Alpha"]):
        client.post(
            "/api/students",
            json={
                "email": email,
                "name": name,
                "region": "美东",
                "level": "小白",
                "source": "讲武堂",
            },
        )

    def names() -> list[str]:
        return [s["name"] for s in client.get("/api/students").json()]

    assert names() == ["Alpha", "Bravo", "Charlie"]

    client.patch("/api/students/a@example.com", json={"note": "edited"})

    assert names() == ["Alpha", "Bravo", "Charlie"]


def test_list_order_breaks_name_ties_deterministically(client, db_session):
    """Two students share a name — common enough with Chinese names. Leaving
    the tie unbroken puts the pair in an arbitrary order that can change on
    any write, which is the same defect one level down."""
    db_session.exec(delete(Student))
    for email in ["z@example.com", "y@example.com"]:
        client.post(
            "/api/students",
            json={
                "email": email,
                "name": "Same Name",
                "region": "美东",
                "level": "小白",
                "source": "讲武堂",
            },
        )

    first_pass = [s["email"] for s in client.get("/api/students").json()]
    client.patch("/api/students/y@example.com", json={"note": "edited"})
    second_pass = [s["email"] for s in client.get("/api/students").json()]

    assert first_pass == ["y@example.com", "z@example.com"]
    assert second_pass == first_pass


def test_get_student_by_email_case_insensitive(client):
    resp = client.get("/api/students/CHEN.JIAHE@EXAMPLE.COM")
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "chen.jiahe@example.com"
    assert body["name"] == "陈嘉禾"
    assert body["tz"] == "UTC-8"


def test_create_rejects_blank_name(client, db_session):
    """The same rule has to hold on both write paths. Enforcing it on update
    alone would leave the create path able to produce exactly the state the
    rule exists to prevent."""
    resp = client.post(
        "/api/students",
        json={
            "email": "blank.name@example.com",
            "name": "   ",
            "region": "美东",
            "level": "小白",
            "source": "讲武堂",
        },
    )

    assert resp.status_code == 422
    assert client.get("/api/students/blank.name@example.com").status_code == 404


def test_get_student_not_found(client):
    resp = client.get("/api/students/nobody@example.com")
    assert resp.status_code == 404
