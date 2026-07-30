from datetime import UTC, datetime

from sqlmodel import select

from app.models import Student

EXISTING = "chen.jiahe@example.com"


def new_student_payload(email: str) -> dict:
    return {
        "email": email,
        "name": "测试学员",
        "region": "美西",
        "level": "小白",
        "source": "讲武堂",
    }


def test_partial_update_changes_only_the_named_field(client, db_session):
    """The UI commits one field at a time, so an update body carries just that
    field — everything else must survive untouched."""
    before = db_session.exec(select(Student).where(Student.email == EXISTING)).one()
    original_name, original_note = before.name, before.note

    resp = client.patch(f"/api/students/{EXISTING}", json={"wechat": "wx_updated"})

    assert resp.status_code == 200
    db_session.expire_all()
    after = db_session.exec(select(Student).where(Student.email == EXISTING)).one()
    assert after.wechat == "wx_updated"
    assert after.name == original_name
    assert after.note == original_note


def test_name_update_persists(client, db_session):
    """Name was the one field in the profile with no write path. Imported
    records carry group-chat nicknames instead of real names, and without this
    the only fix was archive-and-recreate, which throws away the note."""
    resp = client.patch(f"/api/students/{EXISTING}", json={"name": "改过的名字"})

    assert resp.status_code == 200
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).name == "改过的名字"


def test_request_without_name_leaves_it_alone(client, db_session):
    """The three inputs below have to stay distinguishable. This one is
    "the request never mentioned the name" — exclude_unset territory."""
    before = db_session.get(Student, EXISTING).name

    client.patch(f"/api/students/{EXISTING}", json={"wechat": "wx_x"})

    db_session.expire_all()
    assert db_session.get(Student, EXISTING).name == before


def test_explicit_null_name_is_rejected(client, db_session):
    """An explicit JSON null parses to the same value the sentinel uses for
    "not mentioned", but means something else. The column is NOT NULL, so
    letting it through turns an edit into a 500."""
    before = db_session.get(Student, EXISTING).name

    resp = client.patch(f"/api/students/{EXISTING}", json={"name": None})

    assert resp.status_code == 422
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).name == before


def test_blank_name_is_rejected(client, db_session):
    """Name is the displayed identity and the list's sort key — a blank one
    turns a row into an unidentifiable gap. Unlike every other editable
    field, clearing it is not a legitimate edit."""
    before = db_session.get(Student, EXISTING).name

    resp = client.patch(f"/api/students/{EXISTING}", json={"name": "   "})

    assert resp.status_code == 422
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).name == before


def test_name_is_stored_trimmed(client, db_session):
    """Names arrive pasted from group rosters and spreadsheets, which carry
    stray whitespace. Storing it would make the same person sort in two
    different places."""
    client.patch(f"/api/students/{EXISTING}", json={"name": "  张三  "})

    db_session.expire_all()
    assert db_session.get(Student, EXISTING).name == "张三"


def test_name_update_leaves_other_fields_alone(client, db_session):
    """The note is the least reproducible data in the system — it is hand
    written and exists nowhere else. A name edit must not touch it."""
    client.patch(
        f"/api/students/{EXISTING}",
        json={"wechat": "wx_before", "note": "手写备注", "tags": ["活跃"]},
    )

    client.patch(f"/api/students/{EXISTING}", json={"name": "只改名字"})

    db_session.expire_all()
    after = db_session.get(Student, EXISTING)
    assert after.name == "只改名字"
    assert after.wechat == "wx_before"
    assert after.note == "手写备注"
    assert after.tags == ["活跃"]


def test_other_fields_can_still_be_cleared(client, db_session):
    """Tightening the name must not tighten the rest. Clearing a wechat handle
    is a legitimate edit, and the sentinel already distinguishes "" from
    "field absent" — this pins that the name rule did not leak sideways."""
    client.patch(f"/api/students/{EXISTING}", json={"wechat": "wx_temp"})

    resp = client.patch(f"/api/students/{EXISTING}", json={"wechat": ""})

    assert resp.status_code == 200
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).wechat == ""


def test_email_in_body_does_not_rewrite_the_primary_key(client, db_session):
    """Email is the identity everything else joins on — it must not be
    reachable through an update body, however the body is shaped."""
    client.patch(f"/api/students/{EXISTING}", json={"email": "hijacked@example.com"})

    db_session.expire_all()
    assert db_session.get(Student, EXISTING) is not None
    assert db_session.get(Student, "hijacked@example.com") is None


def test_invalid_enum_value_is_rejected_and_nothing_is_written(client, db_session):
    before = db_session.exec(select(Student).where(Student.email == EXISTING)).one()
    original_region = before.region

    resp = client.patch(f"/api/students/{EXISTING}", json={"region": "火星"})

    assert resp.status_code >= 400
    db_session.expire_all()
    after = db_session.exec(select(Student).where(Student.email == EXISTING)).one()
    assert after.region == original_region


def test_clearing_a_note_differs_from_leaving_it_alone(client, db_session):
    """The distinction this pins: an absent field and a field set to "" mean
    different things. Conflate them and clearing a note becomes a silent no-op
    — the edit appears to work and nothing changes."""
    client.patch(f"/api/students/{EXISTING}", json={"note": "写点东西"})
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).note == "写点东西"

    # Explicitly empty → cleared.
    client.patch(f"/api/students/{EXISTING}", json={"note": ""})
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).note == ""

    # Absent → untouched, even though the stored value is itself empty.
    client.patch(f"/api/students/{EXISTING}", json={"note": "重新写"})
    db_session.expire_all()
    client.patch(f"/api/students/{EXISTING}", json={"wechat": "unrelated"})
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).note == "重新写"


def test_creating_a_student_persists_it(client, db_session):
    resp = client.post("/api/students", json=new_student_payload("newbie@example.com"))

    assert resp.status_code == 201
    db_session.expire_all()
    assert db_session.get(Student, "newbie@example.com") is not None


def test_creating_with_an_active_students_email_conflicts(client, db_session):
    resp = client.post("/api/students", json=new_student_payload(EXISTING))

    assert resp.status_code == 409
    db_session.expire_all()
    # The existing record is untouched — not renamed to the submitted name.
    assert db_session.get(Student, EXISTING).name == "陈嘉禾"


def test_creating_with_an_archived_students_email_conflicts_without_touching_it(
    client, db_session
):
    """Refusing here is the point. An archived record carries notes, tags and a
    wechat handle gathered earlier — the parts that are expensive to collect
    again. Overwriting or silently un-archiving would discard them."""
    archived = db_session.get(Student, EXISTING)
    archived.archived_at = datetime.now(UTC)
    archived.note = "归档前的备注"
    db_session.add(archived)
    db_session.commit()

    resp = client.post("/api/students", json=new_student_payload(EXISTING))

    assert resp.status_code == 409
    body = resp.json()
    assert "archiv" in str(body).lower() or "归档" in str(body)

    db_session.expire_all()
    after = db_session.get(Student, EXISTING)
    assert after.archived_at is not None, "must not silently un-archive"
    assert after.note == "归档前的备注", "must not overwrite the earlier record"


def test_archiving_stamps_a_time_and_restoring_clears_it(client, db_session):
    resp = client.post(f"/api/students/{EXISTING}/archive")
    assert resp.status_code == 200
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).archived_at is not None

    resp = client.post(f"/api/students/{EXISTING}/restore")
    assert resp.status_code == 200
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).archived_at is None


def test_restore_returns_every_field_exactly_as_it_was(client, db_session):
    """Archiving is a soft delete — the record and everything hanging off it
    stay. If a round trip through archive/restore altered any field, the
    'delete' would be quietly lossy."""
    before = client.get(f"/api/students/{EXISTING}").json()

    assert client.post(f"/api/students/{EXISTING}/archive").status_code == 200
    assert client.post(f"/api/students/{EXISTING}/restore").status_code == 200

    assert client.get(f"/api/students/{EXISTING}").json() == before


def test_archive_time_comes_from_the_server_not_the_caller(client, db_session):
    """A client-supplied timestamp is a client-controlled fact. Ignoring the
    body keeps the audit value trustworthy."""
    client.post(
        f"/api/students/{EXISTING}/archive",
        json={"archived_at": "1999-01-01T00:00:00Z"},
    )

    db_session.expire_all()
    stamped = db_session.get(Student, EXISTING).archived_at
    assert stamped.year != 1999


def test_list_hides_archived_students_by_default(client, db_session):
    """The default list is the in-study roster. An archived student showing up
    there would make archiving look broken."""
    client.post(f"/api/students/{EXISTING}/archive")

    emails = [s["email"] for s in client.get("/api/students").json()]
    assert EXISTING not in emails
    assert len(emails) > 0, "archiving one student must not empty the roster"


def test_list_can_ask_for_the_archived_students(client, db_session):
    """The UI's 在读/已归档 toggle needs both halves to be reachable."""
    client.post(f"/api/students/{EXISTING}/archive")

    emails = [
        s["email"] for s in client.get("/api/students?archived=true").json()
    ]
    assert emails == [EXISTING]


def test_email_is_stored_lowercased(client, db_session):
    """Email is the join key against EliteCoach101 enrollment and grades.csv.
    Those sources carry whatever casing the student typed, so storing the
    literal we were handed lets `Chen.JiaHe@` and `chen.jiahe@` denote one
    person under two keys — and the joins would silently drop rows."""
    resp = client.post("/api/students", json=new_student_payload("MiXeD.Case@Example.COM"))

    assert resp.status_code == 201
    db_session.expire_all()
    assert db_session.get(Student, "mixed.case@example.com") is not None
    assert db_session.get(Student, "MiXeD.Case@Example.COM") is None


def test_a_differently_cased_duplicate_email_conflicts(client, db_session):
    resp = client.post("/api/students", json=new_student_payload(EXISTING.upper()))

    assert resp.status_code == 409


def test_explicit_null_is_rejected_rather_than_written(client, db_session):
    """`None` is this schema's sentinel for "field not provided". A client that
    sends an explicit JSON null means something different — but the two are
    indistinguishable once parsed, and writing the sentinel into a NOT NULL
    column turns an edit into a 500. Reject it at the boundary instead."""
    before = db_session.get(Student, EXISTING).wechat

    resp = client.patch(f"/api/students/{EXISTING}", json={"wechat": None})

    assert resp.status_code == 422
    db_session.expire_all()
    assert db_session.get(Student, EXISTING).wechat == before
