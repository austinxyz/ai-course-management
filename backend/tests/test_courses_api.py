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


# --- 已报人数 -------------------------------------------------------------


def _seed_person(db_session, email, name="学员甲", archived=False):
    from app.models import Student

    student = Student(
        email=email, name=name, region="美东", level="小白", source="讲武堂",
        archived=archived,
    )
    db_session.add(student)
    db_session.commit()
    return student


def _seed_enrollment(db_session, email, course, session_row=None, status="enrolled"):
    from app.models import Enrollment

    row = Enrollment(
        student_email=email,
        course_id=course.id,
        session_id=session_row.id if session_row else None,
        enrolled_at=date(2026, 7, 1),
        status=status,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _only_session(client, course):
    body = [c for c in client.get("/api/courses").json() if c["id"] == str(course.id)][0]
    return body, body["sessions"][0]


def test_session_carries_its_enrolled_count(client, db_session):
    course = seed_course(db_session)
    only = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 1), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(only)
    db_session.commit()
    db_session.refresh(only)

    _seed_enrollment(db_session, _seed_person(db_session, "a@example.com").email, course, only)
    _seed_enrollment(db_session, _seed_person(db_session, "b@example.com").email, course, only)
    _seed_enrollment(
        db_session, _seed_person(db_session, "c@example.com").email, course, only,
        status="withdrawn",
    )

    _, session_body = _only_session(client, course)
    assert session_body["enrolled_count"] == 2


def test_archiving_a_student_does_not_change_the_count(client, db_session):
    """归档说的是"这个人还在不在名单里"，报课说的是"他报没报这门课"——两件事。

    若归档也排除计数，历史数字会随今天的操作被改写："6 月那场当时 12 人"
    在归档一个人之后变成 11。人真的不来了，正确的表达是把那条报课标退课。
    """
    course = seed_course(db_session)
    only = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 1), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(only)
    db_session.commit()
    db_session.refresh(only)

    gone = _seed_person(db_session, "gone@example.com", archived=True)
    here = _seed_person(db_session, "here@example.com")
    _seed_enrollment(db_session, gone.email, course, only)
    _seed_enrollment(db_session, here.email, course, only)

    _, session_body = _only_session(client, course)
    assert session_body["enrolled_count"] == 2


def test_write_responses_carry_the_same_counts_as_the_list(client, db_session):
    """写操作的返回也要带准确计数。

    前端拿 PATCH 的返回直接更新界面状态；这里若给 0，编辑一场的备注就会让
    人数在界面上归零，而下次刷新又变回来——看着像数据丢了。
    """
    course = seed_course(db_session)
    only = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 1), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(only)
    db_session.commit()
    db_session.refresh(only)
    _seed_enrollment(db_session, _seed_person(db_session, "a@example.com").email, course, only)

    patched = client.patch(
        f"/api/courses/{course.id}/sessions/{only.id}", json={"note": "改个备注"}
    ).json()

    assert patched["sessions"][0]["enrolled_count"] == 1


def test_course_counts_the_people_who_have_not_picked_a_session(client, db_session):
    """不另计的话这批人在课程页上完全不可见——他们不属于任何一场。"""
    course = seed_course(db_session)
    for email in ["a@example.com", "b@example.com", "c@example.com"]:
        _seed_enrollment(db_session, _seed_person(db_session, email).email, course, None)
    _seed_enrollment(
        db_session, _seed_person(db_session, "d@example.com").email, course, None,
        status="withdrawn",
    )

    body = [c for c in client.get("/api/courses").json() if c["id"] == str(course.id)][0]
    assert body["undecided_count"] == 3


def test_course_counts_people_not_records(client, db_session):
    """重复听同一门课的人有两条记录，但只是一个人——作业也只算一份。"""
    course = seed_course(db_session)
    june = CourseSession(
        course_id=course.id, local_date=date(2026, 6, 14), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    august = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 22), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(june)
    db_session.add(august)
    db_session.commit()
    db_session.refresh(june)
    db_session.refresh(august)

    twice = _seed_person(db_session, "twice@example.com")
    once = _seed_person(db_session, "once@example.com")
    _seed_enrollment(db_session, twice.email, course, june)
    _seed_enrollment(db_session, twice.email, course, august)
    _seed_enrollment(db_session, once.email, course, june)

    body = [c for c in client.get("/api/courses").json() if c["id"] == str(course.id)][0]
    assert body["enrolled_people"] == 2
    assert sum(s["enrolled_count"] for s in body["sessions"]) == 3


# --- 删除场次的守卫 -------------------------------------------------------


def test_deleting_a_session_with_enrollments_is_refused(client, db_session):
    """删一场会让指向它的报课悬空。

    不采用"删除时自动把这些报课的场次置空"：那会静默把一批人推进待跟进状态，
    而讲师不会知道自己制造了这些待办。删场次牵动的是真人的位子，值得多一步。
    """
    course = seed_course(db_session)
    only = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 1), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(only)
    db_session.commit()
    db_session.refresh(only)
    for email in ["a@example.com", "b@example.com"]:
        _seed_enrollment(db_session, _seed_person(db_session, email).email, course, only)

    resp = client.delete(f"/api/courses/{course.id}/sessions/{only.id}")

    assert resp.status_code == 409
    # 条数要在信息里——"删不掉"而不说几条挡着，用户无从下手
    assert "2" in resp.json()["detail"]


def test_withdrawn_enrollments_still_block_the_delete(client, db_session):
    """退课的记录仍然指向这一场，删了它就指向不存在的东西。"""
    course = seed_course(db_session)
    only = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 1), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(only)
    db_session.commit()
    db_session.refresh(only)
    _seed_enrollment(
        db_session, _seed_person(db_session, "a@example.com").email, course, only,
        status="withdrawn",
    )

    assert client.delete(f"/api/courses/{course.id}/sessions/{only.id}").status_code == 409


def test_a_session_without_enrollments_can_still_be_deleted(client, db_session):
    """守卫只挡有报课的那些——没有人报名的场次照常能删。"""
    course = seed_course(db_session)
    only = CourseSession(
        course_id=course.id, local_date=date(2026, 8, 1), local_time=time(20, 30),
        teacher="Austin Xu",
    )
    db_session.add(only)
    db_session.commit()
    db_session.refresh(only)

    resp = client.delete(f"/api/courses/{course.id}/sessions/{only.id}")

    assert resp.status_code == 200
    assert resp.json()["sessions"] == []
