"""表层面的约束：课程、别名、场次。

这些断言直接打数据库，不经 API —— 检验的是 schema 本身承诺的东西。
应用层校验另有测试（test_courses_write.py）。
"""

import uuid
from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.models import Course, CourseAlias, CourseSession


def make_course(session, name="测试课程", **kw) -> Course:
    course = Course(name=name, **kw)
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def test_course_needs_only_a_name(db_session):
    """其余字段可事后补填 —— 建课时讲师手里往往只有名字。"""
    course = make_course(db_session)

    stored = db_session.get(Course, course.id)
    assert stored.name == "测试课程"
    assert stored.short == ""
    assert stored.offline is False


def test_alias_is_unique_across_the_whole_table(db_session):
    """别名的唯一用途是消除导入时的歧义，所以两门课不能共用一个别名。
    唯一性由主键保证——不靠应用层先查一遍再写。"""
    a = make_course(db_session, name="课程甲")
    b = make_course(db_session, name="课程乙")
    db_session.add(CourseAlias(alias="s1", raw="S1", course_id=a.id))
    db_session.commit()

    db_session.add(CourseAlias(alias="s1", raw="s1", course_id=b.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_session_stores_wall_time_and_a_zone_name(db_session):
    """存的是"美西 19:30"这个墙上时间与时区名，不是某个 UTC 偏移数字。
    偏移会随夏令时变，墙上时间不会——它才是讲师排课时的意图。"""
    course = make_course(db_session)
    db_session.add(
        CourseSession(
            course_id=course.id,
            local_date=date(2026, 10, 15),
            local_time=time(19, 30),
            teacher="讲师甲",
        )
    )
    db_session.commit()

    stored = db_session.exec(select(CourseSession)).one()
    assert stored.local_date == date(2026, 10, 15)
    assert stored.local_time == time(19, 30)
    assert stored.tz == "America/Los_Angeles"
    assert stored.state_override is None  # null = 跟随日期
    # 没有任何存偏移小时数的列
    assert not any("offset" in c.name for c in CourseSession.__table__.columns)


def test_two_sessions_of_one_course_can_have_different_teachers(db_session):
    """报满后加的第二场、为亚洲时区加的晚场，讲师可能都不是同一个人。"""
    course = make_course(db_session)
    for teacher, day in (("讲师甲", 15), ("讲师乙", 22)):
        db_session.add(
            CourseSession(
                course_id=course.id,
                local_date=date(2026, 10, day),
                local_time=time(19, 30),
                teacher=teacher,
            )
        )
    db_session.commit()

    teachers = {s.teacher for s in db_session.exec(select(CourseSession)).all()}
    assert teachers == {"讲师甲", "讲师乙"}


def test_deleting_a_course_takes_its_aliases_and_sessions(db_session):
    """课程没有界面上的删除入口，但外键仍要说清归属：孤儿别名会让
    导入匹配到一门不存在的课。"""
    course = make_course(db_session)
    db_session.add(CourseAlias(alias="s9", raw="S9", course_id=course.id))
    db_session.add(
        CourseSession(
            course_id=course.id,
            local_date=date(2026, 10, 15),
            local_time=time(19, 30),
            teacher="讲师甲",
        )
    )
    db_session.commit()

    db_session.delete(db_session.get(Course, course.id))
    db_session.commit()

    assert db_session.exec(select(CourseAlias)).all() == []
    assert db_session.exec(select(CourseSession)).all() == []


def test_session_requires_a_course_that_exists(db_session):
    """场次挂在课程上；指向不存在的课程要被数据库拒绝。"""
    db_session.add(
        CourseSession(
            course_id=uuid.uuid4(),
            local_date=date(2026, 10, 15),
            local_time=time(19, 30),
            teacher="讲师甲",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
