"""GET /api/courses 的读契约。"""

from datetime import date, time

from app.models import Course, CourseAlias, CourseSession


def seed_course(db_session, name="课程甲", **kw) -> Course:
    course = Course(name=name, **kw)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


def test_empty_db_returns_an_empty_array(client, db_session):
    """空库是「还没建课」，不是错误。前端据此渲染空态而不是错误卡片。"""
    resp = client.get("/api/courses")

    assert resp.status_code == 200
    assert resp.json() == []


def test_course_comes_with_its_aliases_and_sessions(client, db_session):
    """一次取全：课程页要同时显示别名与场次，分三次请求只会让页面分三次抖动。"""
    course = seed_course(db_session, short="甲", tagline="讲给谁", homework_title="做一件真实工作")
    db_session.add(CourseAlias(alias="s1", raw="S1", course_id=course.id))
    db_session.add(
        CourseSession(
            course_id=course.id,
            local_date=date(2026, 10, 15),
            local_time=time(19, 30),
            teacher="讲师甲",
            note="第一场",
        )
    )
    db_session.commit()

    body = client.get("/api/courses").json()

    assert len(body) == 1
    row = body[0]
    assert row["name"] == "课程甲"
    assert row["short"] == "甲"
    assert row["tagline"] == "讲给谁"
    assert row["homework_title"] == "做一件真实工作"
    assert row["offline"] is False
    # 别名回传用户当初的写法，匹配用的归一化值不外露给界面
    assert [a["raw"] for a in row["aliases"]] == ["S1"]
    assert len(row["sessions"]) == 1
    assert row["sessions"][0]["teacher"] == "讲师甲"


def test_offline_course_is_still_listed(client, db_session):
    """已下线不是删除。它得留在列表里，带标记——否则「这门课去哪了」无从回答。"""
    seed_course(db_session, name="下线课", offline=True)

    body = client.get("/api/courses").json()

    assert [(c["name"], c["offline"]) for c in body] == [("下线课", True)]


def test_session_response_carries_wall_time_and_zone(client, db_session):
    """响应给墙上时间与时区名——编辑表单要用它们回填。"""
    course = seed_course(db_session)
    db_session.add(
        CourseSession(
            course_id=course.id,
            local_date=date(2026, 12, 15),
            local_time=time(19, 30),
            teacher="讲师甲",
        )
    )
    db_session.commit()

    s = client.get("/api/courses").json()[0]["sessions"][0]

    assert s["local_date"] == "2026-12-15"
    assert s["local_time"] == "19:30:00"
    assert s["tz"] == "America/Los_Angeles"
