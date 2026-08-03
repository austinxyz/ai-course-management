"""各分项满分：`GET /api/homework/rubric` 与 `PUT /api/homework/rubric`。

满分独立于 `homework_submissions.scores` 存储——那是 item+score 的 jsonb 数组，
满分是课程级配置，不该跟着每条提交重复。分项名字系统自动从已导入成绩里去重列出，
不要求讲师手打，避免"配了但跟源文件列名对不上"。
"""

from datetime import date

import pytest
from sqlmodel import Session, select

from app.models import Course, Enrollment, HomeworkRubricItem, HomeworkSubmission, Student


def _student(session: Session, email: str, name: str = "学员") -> Student:
    row = Student(email=email, name=name, region="美东", level="有基础", source="讲武堂")
    session.add(row)
    session.commit()
    return row


def _course(session: Session, name="课程甲", short="S1") -> Course:
    course = Course(name=name, short=short)
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def _enroll(session: Session, email: str, course: Course) -> None:
    session.add(Enrollment(student_email=email, course_id=course.id, enrolled_at=date(2026, 6, 1)))
    session.commit()


def _submit(session: Session, email: str, course: Course, scores: list[dict], total=77) -> HomeworkSubmission:
    row = HomeworkSubmission(
        student_email=email,
        course_id=course.id,
        submitted_at=date(2026, 6, 11),
        total=total,
        scores=scores,
        source_ref="session1/grades.csv:2",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@pytest.fixture
def course_with_items(db_session):
    """一门课、一条提交，分项 A1 与 D2，都还没配满分。"""
    course = _course(db_session)
    _student(db_session, "rubric-a@example.com", "学员甲")
    _enroll(db_session, "rubric-a@example.com", course)
    _submit(
        db_session,
        "rubric-a@example.com",
        course,
        [{"item": "A1", "score": 38}, {"item": "D2", "score": 35}],
    )
    return course


class TestGetRubric:
    def test_lists_items_seen_in_submissions_with_null_max(self, client, course_with_items):
        response = client.get(f"/api/homework/rubric?course={course_with_items.id}")

        assert response.status_code == 200
        body = response.json()
        by_item = {row["item"]: row["max_score"] for row in body}
        assert by_item == {"A1": None, "D2": None}


class TestPutRubric:
    def test_sets_max_score_for_an_item(self, client, db_session, course_with_items):
        response = client.put(
            "/api/homework/rubric",
            json={
                "course_id": str(course_with_items.id),
                "items": [{"item": "A1", "max_score": 50}, {"item": "D2", "max_score": None}],
            },
        )

        assert response.status_code == 200
        row = db_session.exec(
            select(HomeworkRubricItem).where(
                HomeworkRubricItem.course_id == course_with_items.id,
                HomeworkRubricItem.item == "A1",
            )
        ).one()
        assert row.max_score == 50
        d2 = db_session.exec(
            select(HomeworkRubricItem).where(
                HomeworkRubricItem.course_id == course_with_items.id,
                HomeworkRubricItem.item == "D2",
            )
        ).first()
        assert d2 is None

    def test_rejects_zero_or_negative_max_score(self, client, course_with_items):
        response = client.put(
            "/api/homework/rubric",
            json={
                "course_id": str(course_with_items.id),
                "items": [{"item": "A1", "max_score": 0}],
            },
        )

        assert response.status_code == 422
        assert "正整数" in response.json()["detail"]
