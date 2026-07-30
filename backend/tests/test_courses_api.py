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


def add_session(db_session, course, day, time_str="20:30"):
    from datetime import date, time as clock

    hour, minute = (int(x) for x in time_str.split(":"))
    db_session.add(
        CourseSession(
            course_id=course.id,
            local_date=date.fromisoformat(day),
            local_time=clock(hour, minute),
            teacher="Austin Xu",
        )
    )
    db_session.commit()


def names(client) -> list[str]:
    return [c["name"] for c in client.get("/api/courses").json()]


def test_courses_lead_with_the_one_that_ran_most_recently(client, db_session):
    """按名字排对讲师没有意义——他找的是"最近在上的那门"。"""
    for name, day in (("六月那门", "2026-06-28"), ("七月那门", "2026-07-26"), ("五月那门", "2026-05-10")):
        add_session(db_session, seed_course(db_session, name=name), day)

    assert names(client) == ["七月那门", "六月那门", "五月那门"]


def test_a_multi_session_course_sorts_by_its_earliest_sitting(client, db_session):
    """"这门课什么时候开的"指第一场，不是最后一场。

    若用最晚那场当键，五月开的课会因为十二月还有一场而跳到最前 ——
    而它其实是最早开的那门。
    """
    early = seed_course(db_session, name="五月开的")
    add_session(db_session, early, "2026-05-10")
    add_session(db_session, early, "2026-12-01")
    add_session(db_session, seed_course(db_session, name="六月开的"), "2026-06-28")

    assert names(client) == ["六月开的", "五月开的"]


def test_an_unscheduled_course_sorts_first(client, db_session):
    """还没排课的是刚建出来、正在张罗的那门；沉到末尾等于把要动手的东西藏起来。"""
    add_session(db_session, seed_course(db_session, name="已排课"), "2026-07-26")
    seed_course(db_session, name="还没排课")

    assert names(client) == ["还没排课", "已排课"]


def test_order_does_not_shuffle_after_a_write(client, db_session):
    """两门排序键相同的课，编辑其中一门之后相对顺序不变。

    用真实 PATCH 触发，不是连查两次 —— 学员名单那个排序 bug 恰恰是 UPDATE 之后
    才显形（行被写到堆尾），连查两次根本碰不到它。
    """
    same_day = "2026-07-26"
    a = seed_course(db_session, name="甲课")
    b = seed_course(db_session, name="乙课")
    add_session(db_session, a, same_day)
    add_session(db_session, b, same_day)
    before = names(client)

    edited = [c for c in client.get("/api/courses").json() if c["name"] == "甲课"][0]
    client.patch(f"/api/courses/{edited['id']}", json={"tagline": "改一下"})

    assert names(client) == before
