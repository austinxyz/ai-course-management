"""互动记录：`GET /api/interactions`、`GET /api/interactions/count`。

纯只读聚合视图，数据源是 `nudge` 能力已有的 `nudge_events` 表——不新增写路径。
夹具邮箱一律带 `ix-` 前缀，避免撞上其他测试文件的固定邮箱。
"""

from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session

from app.models import Course, NudgeEvent, Student


def _student(session: Session, email: str, name: str = "学员") -> Student:
    row = Student(email=email, name=name, region="美东", level="有基础", source="讲武堂")
    session.add(row)
    session.commit()
    return row


def _course(session: Session, name: str = "课程甲") -> Course:
    course = Course(name=name)
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def _event(
    session: Session,
    email: str,
    course: Course,
    event_type: str = "nudged",
    channel: str | None = "email",
    note: str = "",
    created_at: datetime | None = None,
) -> NudgeEvent:
    row = NudgeEvent(
        student_email=email,
        course_id=course.id,
        event_type=event_type,
        channel=channel,
        note=note,
        created_at=created_at or datetime.now(UTC),
    )
    session.add(row)
    session.commit()
    return row


def _list(client) -> list[dict]:
    resp = client.get("/api/interactions")
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


def _count(client) -> int:
    resp = client.get("/api/interactions/count")
    assert resp.status_code == 200, resp.text
    return resp.json()["total"]


class TestList:
    def test_returns_items_ordered_by_created_at_desc_with_names(self, client, db_session):
        course = _course(db_session, "课程甲")
        _student(db_session, "ix-alpha@example.com", "学员甲")
        _event(db_session, "ix-alpha@example.com", course, created_at=datetime.now(UTC) - timedelta(days=2))
        _event(db_session, "ix-alpha@example.com", course, created_at=datetime.now(UTC) - timedelta(hours=1))

        items = _list(client)

        assert len(items) == 2
        assert items[0]["at"] > items[1]["at"]
        assert items[0]["student_name"] == "学员甲"
        assert items[0]["course_name"] == "课程甲"

    def test_includes_all_event_types_regardless_of_channel(self, db_session, client):
        course = _course(db_session)
        _student(db_session, "ix-bravo@example.com", "学员乙")
        _event(db_session, "ix-bravo@example.com", course, event_type="nudged", channel="wechat")
        _event(db_session, "ix-bravo@example.com", course, event_type="skipped", channel=None, note="已私下沟通")
        _event(db_session, "ix-bravo@example.com", course, event_type="unskipped", channel=None)

        items = _list(client)
        types = {i["event_type"] for i in items}

        assert types == {"nudged", "skipped", "unskipped"}
        skipped = next(i for i in items if i["event_type"] == "skipped")
        assert skipped["channel"] is None
        assert skipped["note"] == "已私下沟通"


class TestCount:
    def test_counts_only_last_7_days(self, db_session, client):
        course = _course(db_session)
        _student(db_session, "ix-charlie@example.com", "学员丙")
        _event(db_session, "ix-charlie@example.com", course, created_at=datetime.now(UTC) - timedelta(days=8))
        _event(db_session, "ix-charlie@example.com", course, created_at=datetime.now(UTC) - timedelta(days=3))

        assert _count(client) == 1

    def test_zero_when_no_events(self, client, db_session):
        assert _count(client) == 0
