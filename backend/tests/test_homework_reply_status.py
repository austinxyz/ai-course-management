"""讲师手动标记「已回复」：`POST /api/homework/submissions/{id}/reply` 与 `.../unreply`。

`reply_status`（源文件那列）每次导入整列覆盖，讲师实际回复往往发生在系统之外，
源文件那列常常没跟上。这个标记独立存储，不受重新导入影响——测试的核心断言
就是"标记之后重新导入这门课，标记还在"。
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app.models import Course, CourseAlias, Enrollment, HomeworkSubmission, Student

import base64


def _student(session: Session, email: str, name: str = "学员") -> Student:
    row = Student(email=email, name=name, region="美东", level="有基础", source="讲武堂")
    session.add(row)
    session.commit()
    return row


def _course(session: Session, name="课程甲", short="S1", alias="S1") -> Course:
    course = Course(name=name, short=short)
    session.add(course)
    session.commit()
    session.refresh(course)
    session.add(CourseAlias(alias=alias.lower(), raw=alias, course_id=course.id))
    session.commit()
    return course


def _enroll(session: Session, email: str, course: Course) -> None:
    session.add(Enrollment(student_email=email, course_id=course.id, enrolled_at=date(2026, 6, 1)))
    session.commit()


def _submit(session: Session, email: str, course: Course, **over) -> HomeworkSubmission:
    row = HomeworkSubmission(
        student_email=email,
        course_id=course.id,
        submitted_at=date(2026, 6, 11),
        total=over.pop("total", 77),
        scores=[{"item": "A1工作流结构", "score": 77}],
        reply_status=over.pop("reply_status", "待回复"),
        source_ref="session1/grades.csv:2",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@pytest.fixture
def submission(db_session):
    course = _course(db_session)
    _student(db_session, "reply-hw@example.com", "学员甲")
    _enroll(db_session, "reply-hw@example.com", course)
    return _submit(db_session, "reply-hw@example.com", course)


class TestMarkReplied:
    def test_marking_sets_replied_and_timestamp(self, client, db_session, submission):
        before = datetime.now(timezone.utc)

        response = client.post(f"/api/homework/submissions/{submission.id}/reply")

        assert response.status_code == 200
        body = response.json()
        assert body["replied"] is True
        assert body["replied_at"] is not None

        db_session.refresh(submission)
        assert submission.replied is True
        assert submission.replied_at is not None
        # 时间戳落在测试执行窗口内——由服务端盖的，不是随便一个非空值。
        assert submission.replied_at.replace(tzinfo=timezone.utc) >= before - timedelta(seconds=5)

    def test_can_toggle_back_to_unreplied(self, client, db_session, submission):
        client.post(f"/api/homework/submissions/{submission.id}/reply")

        response = client.post(f"/api/homework/submissions/{submission.id}/unreply")

        assert response.status_code == 200
        body = response.json()
        assert body["replied"] is False
        assert body["replied_at"] is None
        db_session.refresh(submission)
        assert submission.replied is False
        assert submission.replied_at is None

    def test_client_supplied_timestamp_is_ignored(self, client, db_session, submission):
        response = client.post(
            f"/api/homework/submissions/{submission.id}/reply",
            json={"replied_at": "2020-01-01T00:00:00Z"},
        )

        assert response.status_code == 200
        db_session.refresh(submission)
        # 服务端时间，不是请求体里那个 2020 年的值。
        assert submission.replied_at.year >= 2026

    def test_marking_unknown_submission_is_404(self, client):
        response = client.post(
            "/api/homework/submissions/00000000-0000-0000-0000-000000000000/reply"
        )

        assert response.status_code == 404


class TestReplyMarkSurvivesReimport:
    def test_reimporting_the_course_does_not_clear_the_mark(self, client, db_session, submission):
        client.post(f"/api/homework/submissions/{submission.id}/reply")

        course = db_session.get(Course, submission.course_id)
        text = (
            "姓名,邮件,提交时间,总分,A1工作流结构,亮点,改进建议,回复状态\n"
            "学员甲,reply-hw@example.com,2026-06-12,90,90,,,\n"
        )
        payload = {
            "content_base64": base64.b64encode(text.encode("utf-8")).decode("ascii"),
            "filename": "session1/grades.csv",
            "course_id": str(course.id),
        }
        reimport = client.post("/api/homework/import?dry_run=false", json=payload)
        assert reimport.status_code == 200

        db_session.refresh(submission)
        assert submission.replied is True
        # 成绩本身确实被这次导入更新了——标记独立于成绩字段，不是"整行没变"。
        assert submission.total == 90
