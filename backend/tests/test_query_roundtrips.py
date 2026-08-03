"""读接口的**数据库往返次数**。

这不是微优化的洁癖：实测每多一次往返 ≈ 64ms（Render → Supabase），
而三个接口的耗时恰好落在 `106 + 64 × 查询数` 这条线上——
`/api/students` 1 查询 170ms、`/api/enrollments` 3 查询 293ms、`/api/courses` 4 查询 361ms。

页面的总时长被最慢的那个接口卡住，所以往返次数就是用户感知到的延迟。
把它钉成断言，是因为它会**悄悄退化**：以后有人加一行 `session.exec(...)`，
功能测试全绿，只是每次切页面慢 64ms，而没有任何东西会提醒他。
"""

from datetime import date, time

import pytest
from sqlalchemy import event

from app.models import (
    Course,
    CourseAlias,
    CourseSession,
    Enrollment,
    HomeworkRubricItem,
    HomeworkSubmission,
    Student,
)


@pytest.fixture
def count_queries(db_session):
    """数一次请求里发了多少条 SQL。"""
    counter = {"n": 0}
    engine = db_session.get_bind()

    def before(conn, cursor, statement, params, context, executemany):
        # 只数真正的查询；事务控制语句不算
        if statement.strip().upper().startswith(("SELECT", "INSERT", "UPDATE", "DELETE")):
            counter["n"] += 1

    event.listen(engine, "before_cursor_execute", before)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", before)


def _seed(db_session):
    course = Course(name="课程甲", short="S1")
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(CourseAlias(alias="s1", raw="S1", course_id=course.id))
    session_row = CourseSession(
        course_id=course.id,
        local_date=date(2026, 8, 1),
        local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(session_row)
    db_session.commit()
    db_session.refresh(session_row)

    student = Student(
        email="alpha@example.com", name="学员甲", region="美东", level="小白", source="讲武堂"
    )
    db_session.add(student)
    db_session.commit()
    db_session.add(
        Enrollment(
            student_email=student.email,
            course_id=course.id,
            session_id=session_row.id,
            enrolled_at=date(2026, 7, 1),
        )
    )
    db_session.commit()
    return course


def test_courses_read_stays_within_two_round_trips(client, db_session, count_queries):
    _seed(db_session)
    count_queries["n"] = 0

    resp = client.get("/api/courses")

    assert resp.status_code == 200
    assert count_queries["n"] <= 2, (
        f"GET /api/courses 发了 {count_queries['n']} 条查询。"
        "每多一条 ≈ 64ms，而三个页面的时长都被这个接口卡着。"
    )


def test_homework_read_is_a_single_round_trip(client, db_session, count_queries):
    course = _seed(db_session)
    # 先把 id 取出来。commit 之后 ORM 对象是过期的，在计数归零之后再访问
    # `course.id` 会触发一次 refresh 查询——那是**测试**发的，不是接口发的，
    # 混进来会让这条断言测的东西完全不是它自称在测的。
    course_id = str(course.id)
    count_queries["n"] = 0

    resp = client.get(f"/api/homework?course={course_id}")

    assert resp.status_code == 200
    assert count_queries["n"] == 1, (
        f"GET /api/homework 发了 {count_queries['n']} 条查询。"
        "报课、学员、场次、作业能在一条 JOIN 里取全——每条报课至多对应一名学员、"
        "一场、一份作业，不会产生笛卡尔积。"
    )


def test_homework_read_with_rubric_data_stays_a_single_round_trip(client, db_session, count_queries):
    """满分表加进来之后，这条约束还在——标量子查询是同一条 SQL 的一部分，
    不是应用发出的第二次调用。"""
    course = _seed(db_session)
    course_id = str(course.id)
    db_session.add(
        HomeworkSubmission(
            student_email="alpha@example.com",
            course_id=course.id,
            submitted_at=date(2026, 7, 15),
            total=45,
            scores=[{"item": "A1", "score": 45}],
        )
    )
    db_session.add(HomeworkRubricItem(course_id=course.id, item="A1", max_score=50))
    db_session.commit()
    count_queries["n"] = 0

    resp = client.get(f"/api/homework?course={course_id}")

    assert resp.status_code == 200
    assert count_queries["n"] == 1, (
        f"GET /api/homework（含满分数据）发了 {count_queries['n']} 条查询——"
        "满分表要用标量子查询嵌进主 SELECT，不能单独发一次 session.exec。"
    )


def test_enrollments_read_is_a_single_round_trip(client, db_session, count_queries):
    _seed(db_session)
    count_queries["n"] = 0

    resp = client.get("/api/enrollments")

    assert resp.status_code == 200
    assert count_queries["n"] == 1, (
        f"GET /api/enrollments 发了 {count_queries['n']} 条查询。"
        "报课、课程、场次能在一条 JOIN 里取全——每条报课至多对应一门课、一场，不会产生笛卡尔积。"
    )
