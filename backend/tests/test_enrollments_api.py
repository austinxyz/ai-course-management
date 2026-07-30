"""报课记录的唯一性约束。

约束由**数据库结构**保证，不是应用层的判断——绕过接口的直写同样要挡住。
因此这些测试直接对着 session 插入，不走 API。
"""

from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Course, CourseSession, Enrollment, Student


def seed_student(db_session, email="alpha@example.com", name="学员甲") -> Student:
    student = Student(email=email, name=name, region="美东", level="小白", source="讲武堂")
    db_session.add(student)
    db_session.commit()
    return student


def seed_course(db_session, name="课程甲") -> Course:
    course = Course(name=name)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


def seed_session(db_session, course, day="2026-08-01") -> CourseSession:
    row = CourseSession(
        course_id=course.id,
        local_date=date.fromisoformat(day),
        local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


def enroll(db_session, student, course, session_row=None, **kw) -> Enrollment:
    row = Enrollment(
        student_email=student.email,
        course_id=course.id,
        session_id=session_row.id if session_row else None,
        enrolled_at=kw.pop("enrolled_at", date(2026, 7, 1)),
        **kw,
    )
    db_session.add(row)
    db_session.commit()
    return row


def test_same_student_course_and_session_cannot_be_enrolled_twice(db_session):
    student = seed_student(db_session)
    course = seed_course(db_session)
    first = seed_session(db_session, course)
    enroll(db_session, student, course, first)

    with pytest.raises(IntegrityError):
        enroll(db_session, student, course, first)


def test_second_undecided_enrollment_for_the_same_course_is_rejected(db_session):
    """两条"未定场次"的记录表示的是同一件事，必须挡住。

    这道断言要靠**真实插入两次**来证明。仅有 (student, course, session_id) 的
    唯一索引挡不住它：Postgres 里 NULL 互不相等，两行都会被收下且互不冲突——
    索引建了却没挡住任何东西，而症状只有在批量导入跑第二遍时才显形
    （每导一次就多一条）。
    """
    student = seed_student(db_session)
    course = seed_course(db_session)
    enroll(db_session, student, course, None)

    with pytest.raises(IntegrityError):
        enroll(db_session, student, course, None)


def test_two_sessions_of_the_same_course_can_both_be_enrolled(db_session):
    """有人上过一次还想再听一遍加深印象——目前不额外收费也不阻止。

    场次不同，于是天然是两条记录，各自跟随自己那一场派生状态。
    """
    student = seed_student(db_session)
    course = seed_course(db_session)
    june = seed_session(db_session, course, "2026-06-14")
    august = seed_session(db_session, course, "2026-08-22")

    enroll(db_session, student, course, june)
    enroll(db_session, student, course, august)

    rows = db_session.query(Enrollment).filter_by(student_email=student.email).all()
    assert len(rows) == 2
    assert {r.session_id for r in rows} == {june.id, august.id}


def test_the_same_session_can_hold_several_students(db_session):
    """唯一键是 (学员, 课程, 场次)——同一场次当然可以有很多人。"""
    course = seed_course(db_session)
    only = seed_session(db_session, course)
    a = seed_student(db_session, "a@example.com", "学员甲")
    b = seed_student(db_session, "b@example.com", "学员乙")

    enroll(db_session, a, course, only)
    enroll(db_session, b, course, only)

    assert db_session.query(Enrollment).filter_by(session_id=only.id).count() == 2
