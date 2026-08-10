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


class TestCreateManual:
    def test_creates_manual_event_near_now(self, db_session, client):
        course = _course(db_session, "课程甲")
        _student(db_session, "ix-delta@example.com", "学员丁")

        resp = client.post(
            "/api/interactions",
            json={
                "student_email": "ix-delta@example.com",
                "course_id": str(course.id),
                "channel": "wechat",
                "note": "聊了下学习进度",
            },
        )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["event_type"] == "manual"
        assert body["channel"] == "wechat"
        assert body["note"] == "聊了下学习进度"
        at = datetime.fromisoformat(body["at"].replace("Z", "+00:00"))
        assert abs((datetime.now(UTC) - at).total_seconds()) < 10

    def test_rejects_blank_note(self, db_session, client):
        course = _course(db_session)
        _student(db_session, "ix-echo@example.com", "学员戊")

        resp = client.post(
            "/api/interactions",
            json={
                "student_email": "ix-echo@example.com",
                "course_id": str(course.id),
                "channel": "wechat",
                "note": "   ",
            },
        )

        assert resp.status_code == 422
        assert _list(client) == []

    def test_rejects_unknown_channel(self, db_session, client):
        course = _course(db_session)
        _student(db_session, "ix-foxtrot@example.com", "学员己")

        resp = client.post(
            "/api/interactions",
            json={
                "student_email": "ix-foxtrot@example.com",
                "course_id": str(course.id),
                "channel": "phone",
                "note": "打了个电话",
            },
        )

        assert resp.status_code == 422

    def test_rejects_unknown_student(self, db_session, client):
        course = _course(db_session)

        resp = client.post(
            "/api/interactions",
            json={
                "student_email": "ix-nobody@example.com",
                "course_id": str(course.id),
                "channel": "wechat",
                "note": "内容",
            },
        )

        assert resp.status_code == 404
        assert "学员" in resp.json()["detail"]

    def test_rejects_unknown_course(self, db_session, client):
        _student(db_session, "ix-golf@example.com", "学员庚")

        resp = client.post(
            "/api/interactions",
            json={
                "student_email": "ix-golf@example.com",
                "course_id": "00000000-0000-0000-0000-000000000000",
                "channel": "wechat",
                "note": "内容",
            },
        )

        assert resp.status_code == 404
        assert "课" in resp.json()["detail"]

    def test_event_type_cannot_be_overridden_by_caller(self, db_session, client):
        course = _course(db_session)
        _student(db_session, "ix-hotel@example.com", "学员辛")

        resp = client.post(
            "/api/interactions",
            json={
                "student_email": "ix-hotel@example.com",
                "course_id": str(course.id),
                "channel": "wechat",
                "note": "内容",
                "event_type": "nudged",
            },
        )

        assert resp.status_code == 201, resp.text
        assert resp.json()["event_type"] == "manual"


class TestCount:
    def test_counts_only_last_7_days(self, db_session, client):
        course = _course(db_session)
        _student(db_session, "ix-charlie@example.com", "学员丙")
        _event(db_session, "ix-charlie@example.com", course, created_at=datetime.now(UTC) - timedelta(days=8))
        _event(db_session, "ix-charlie@example.com", course, created_at=datetime.now(UTC) - timedelta(days=3))

        assert _count(client) == 1

    def test_zero_when_no_events(self, client, db_session):
        assert _count(client) == 0
