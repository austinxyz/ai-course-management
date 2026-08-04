"""催作业：`GET /api/nudge?course=`、`POST /api/nudge/events`。

未交判定复用 `homework` 能力的 `merge_states`/`state_of`（不重新发明"谁该催"）。
夹具邮箱一律带 `nudge-` 前缀，避免撞上其他测试文件的固定邮箱。
"""

from datetime import UTC, date, datetime, timedelta, time

from sqlmodel import Session

from app.models import Course, CourseSession, Enrollment, HomeworkSubmission, NudgeEvent, Student


def _student(session: Session, email: str, name: str = "学员", wechat: str = "") -> Student:
    row = Student(email=email, name=name, region="美东", level="有基础", source="讲武堂", wechat=wechat)
    session.add(row)
    session.commit()
    return row


def _course(session: Session, name: str = "课程甲") -> Course:
    course = Course(name=name)
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def _session_row(session: Session, course: Course, day: date) -> CourseSession:
    row = CourseSession(course_id=course.id, local_date=day, local_time=time(19, 30), teacher="讲师")
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _enroll(session: Session, email: str, course: Course, session_row: CourseSession | None) -> Enrollment:
    row = Enrollment(
        student_email=email,
        course_id=course.id,
        session_id=session_row.id if session_row else None,
        enrolled_at=date(2026, 6, 1),
    )
    session.add(row)
    session.commit()
    return row


def _submit(session: Session, email: str, course: Course) -> HomeworkSubmission:
    row = HomeworkSubmission(
        student_email=email,
        course_id=course.id,
        submitted_at=date.today(),
        total=80,
        scores=[{"item": "A1", "score": 80}],
        source_ref="session1/grades.csv:1",
    )
    session.add(row)
    session.commit()
    return row


def _fetch(client, course: Course) -> list[dict]:
    resp = client.get(f"/api/nudge?course={course.id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _by_email(rows: list[dict]) -> dict[str, dict]:
    return {r["student_email"]: r for r in rows}


class TestOverdueList:
    def test_a_student_with_a_finished_session_and_no_submission_is_overdue(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-alpha@example.com", "学员甲")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        _enroll(db_session, "nudge-alpha@example.com", course, past)

        rows = _by_email(_fetch(client, course))

        assert "nudge-alpha@example.com" in rows
        assert rows["nudge-alpha@example.com"]["overdue_days"] == 9

    def test_not_open_session_is_excluded(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-bravo@example.com", "学员乙")
        future = _session_row(db_session, course, date.today() + timedelta(days=5))
        _enroll(db_session, "nudge-bravo@example.com", course, future)

        rows = _by_email(_fetch(client, course))

        assert "nudge-bravo@example.com" not in rows

    def test_no_session_is_excluded(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-charlie@example.com", "学员丙")
        _enroll(db_session, "nudge-charlie@example.com", course, None)

        rows = _by_email(_fetch(client, course))

        assert "nudge-charlie@example.com" not in rows

    def test_a_student_with_multiple_missing_enrollments_appears_once_at_the_earliest_date(
        self, client, db_session
    ):
        course = _course(db_session)
        _student(db_session, "nudge-delta@example.com", "学员丁")
        earlier = _session_row(db_session, course, date.today() - timedelta(days=14))
        later = _session_row(db_session, course, date.today() - timedelta(days=3))
        _enroll(db_session, "nudge-delta@example.com", course, earlier)
        _enroll(db_session, "nudge-delta@example.com", course, later)

        rows = _fetch(client, course)
        matches = [r for r in rows if r["student_email"] == "nudge-delta@example.com"]

        assert len(matches) == 1
        assert matches[0]["overdue_days"] == 14

    def test_a_submitted_student_is_excluded(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-echo@example.com", "学员戊")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        _enroll(db_session, "nudge-echo@example.com", course, past)
        _submit(db_session, "nudge-echo@example.com", course)

        rows = _by_email(_fetch(client, course))

        assert "nudge-echo@example.com" not in rows


class TestHistory:
    def test_history_is_ordered_most_recent_first(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-foxtrot@example.com", "学员己")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        _enroll(db_session, "nudge-foxtrot@example.com", course, past)
        db_session.add(
            NudgeEvent(
                student_email="nudge-foxtrot@example.com",
                course_id=course.id,
                event_type="nudged",
                channel="email",
                created_at=datetime.now(UTC) - timedelta(days=5),
            )
        )
        db_session.add(
            NudgeEvent(
                student_email="nudge-foxtrot@example.com",
                course_id=course.id,
                event_type="nudged",
                channel="email",
                created_at=datetime.now(UTC) - timedelta(days=1),
            )
        )
        db_session.commit()

        rows = _by_email(_fetch(client, course))
        history = rows["nudge-foxtrot@example.com"]["history"]

        assert len(history) == 2
        assert history[0]["at"] > history[1]["at"]

    def test_no_history_is_an_empty_list(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-golf@example.com", "学员庚")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        _enroll(db_session, "nudge-golf@example.com", course, past)

        rows = _by_email(_fetch(client, course))

        assert rows["nudge-golf@example.com"]["history"] == []


class TestMarkNudged:
    def test_marking_nudged_writes_an_event_without_removing_the_student(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-hotel@example.com", "学员辛", wechat="")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        _enroll(db_session, "nudge-hotel@example.com", course, past)

        resp = client.post(
            "/api/nudge/events",
            json={"student_email": "nudge-hotel@example.com", "course_id": str(course.id), "event_type": "nudged"},
        )

        assert resp.status_code == 201, resp.text
        rows = _by_email(_fetch(client, course))
        assert "nudge-hotel@example.com" in rows
        assert len(rows["nudge-hotel@example.com"]["history"]) == 1
        assert rows["nudge-hotel@example.com"]["history"][0]["type"] == "nudged"

    def test_channel_follows_wechat_alignment(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "nudge-india@example.com", "学员壬", wechat="对齐过的昵称")
        _student(db_session, "nudge-juliet@example.com", "学员癸", wechat="")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        _enroll(db_session, "nudge-india@example.com", course, past)
        _enroll(db_session, "nudge-juliet@example.com", course, past)

        with_wechat = client.post(
            "/api/nudge/events",
            json={"student_email": "nudge-india@example.com", "course_id": str(course.id), "event_type": "nudged"},
        )
        without_wechat = client.post(
            "/api/nudge/events",
            json={"student_email": "nudge-juliet@example.com", "course_id": str(course.id), "event_type": "nudged"},
        )

        assert with_wechat.json()["channel"] == "wechat"
        assert without_wechat.json()["channel"] == "email"


class TestSkip:
    def test_skipping_removes_the_student_from_the_list_without_touching_other_tables(
        self, client, db_session
    ):
        course = _course(db_session)
        _student(db_session, "nudge-kilo@example.com", "学员子")
        past = _session_row(db_session, course, date.today() - timedelta(days=9))
        enrollment = _enroll(db_session, "nudge-kilo@example.com", course, past)

        resp = client.post(
            "/api/nudge/events",
            json={"student_email": "nudge-kilo@example.com", "course_id": str(course.id), "event_type": "skipped", "note": "已私下沟通"},
        )

        assert resp.status_code == 201, resp.text
        rows = _by_email(_fetch(client, course))
        assert "nudge-kilo@example.com" not in rows

        db_session.refresh(enrollment)
        assert enrollment.status == "enrolled"
