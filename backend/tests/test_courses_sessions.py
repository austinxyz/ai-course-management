"""场次：必填、排序、状态派生、时区换算。

时区那几条是本 change 最容易写错的地方，所以断言写死具体时刻，不写"两者不同"。
"""

from datetime import date

import pytest

from app.routers import courses as courses_router


def make_course(client, name="课程甲") -> str:
    return client.post("/api/courses", json={"name": name}).json()["id"]


def add_session(client, cid, **kw):
    body = {"local_date": "2026-10-15", "local_time": "19:30", "teacher": "讲师甲"} | kw
    return client.post(f"/api/courses/{cid}/sessions", json=body)


def sessions_of(client, cid=None):
    courses = client.get("/api/courses").json()
    course = courses[0] if cid is None else next(c for c in courses if c["id"] == cid)
    return course["sessions"]


def test_a_session_needs_date_time_and_teacher(client, db_session):
    cid = make_course(client)

    assert add_session(client, cid).status_code == 201
    assert add_session(client, cid, teacher="  ").status_code == 422
    assert add_session(client, cid, local_time="").status_code == 422


def test_note_is_optional(client, db_session):
    cid = make_course(client)

    resp = add_session(client, cid)

    assert resp.status_code == 201
    assert sessions_of(client)[0]["note"] == ""


def test_two_sessions_can_have_different_teachers(client, db_session):
    """报满后加的第二场、为亚洲时区加的晚场，讲师往往不是同一个人。"""
    cid = make_course(client)
    add_session(client, cid, teacher="讲师甲")
    add_session(client, cid, local_date="2026-10-22", teacher="讲师乙")

    assert [s["teacher"] for s in sessions_of(client)] == ["讲师甲", "讲师乙"]


def test_sessions_come_back_in_date_order(client, db_session):
    """乱序创建也要按日期呈现。没有 ORDER BY 时 UPDATE 会把改过的行写到堆尾，
    改一场的时间就会让它跳到末尾——学员名单上踩过这个坑。"""
    cid = make_course(client)
    for day in ("2026-12-15", "2026-10-15", "2026-11-15"):
        add_session(client, cid, local_date=day)

    assert [s["local_date"] for s in sessions_of(client)] == [
        "2026-10-15",
        "2026-11-15",
        "2026-12-15",
    ]


def test_wall_time_survives_the_dst_switch(client, db_session):
    """两场都填"美西 19:30"，一场在夏令时内、一场在之后。

    墙上时间必须都还是 19:30 —— 这正是存墙上时间而非 UTC 偏移的理由。
    """
    cid = make_course(client)
    add_session(client, cid, local_date="2026-10-15")
    add_session(client, cid, local_date="2026-12-15")

    assert [s["local_time"] for s in sessions_of(client)] == ["19:30:00", "19:30:00"]


def test_absolute_instant_tracks_the_dst_switch(client, db_session):
    """同一个墙上时间，跨夏令时后对应的绝对时刻差一小时。

    **拿上海比，不能拿美东比**：美国两地同日切换，美西→美东恒为 3 小时，
    那条断言无论换算写得对不对都会通过。中国不用夏令时，
    所以美西→上海的时差在 15 与 16 小时之间跳。
    10 月那场（PDT, UTC-7）= 次日 10:30 上海；12 月那场（PST, UTC-8）= 次日 11:30。
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    cid = make_course(client)
    add_session(client, cid, local_date="2026-10-15")
    add_session(client, cid, local_date="2026-12-15")

    shanghai = [
        datetime.fromisoformat(s["starts_at"]).astimezone(ZoneInfo("Asia/Shanghai"))
        for s in sessions_of(client)
    ]

    assert (shanghai[0].date(), shanghai[0].strftime("%H:%M")) == (
        date(2026, 10, 16),
        "10:30",
    )
    assert (shanghai[1].date(), shanghai[1].strftime("%H:%M")) == (
        date(2026, 12, 16),
        "11:30",
    )


def test_state_follows_the_date_by_default(client, db_session, monkeypatch):
    """今天由注入决定，不用真实当天——否则某天这条断言会自己变红。"""
    monkeypatch.setattr(courses_router, "today_pt", lambda: date(2026, 11, 1))
    cid = make_course(client)
    add_session(client, cid, local_date="2026-10-15")  # 已过
    add_session(client, cid, local_date="2026-12-15")  # 未到

    rows = sessions_of(client)

    assert [(s["state"], s["state_is_override"]) for s in rows] == [
        ("done", False),
        ("pending", False),
    ]


def test_state_can_be_overridden_and_released(client, db_session, monkeypatch):
    monkeypatch.setattr(courses_router, "today_pt", lambda: date(2026, 11, 1))
    cid = make_course(client)
    sid = add_session(client, cid, local_date="2026-12-15").json()["sessions"][0]["id"]

    client.patch(f"/api/courses/{cid}/sessions/{sid}", json={"state_override": "cancelled"})
    overridden = sessions_of(client)[0]
    assert (overridden["state"], overridden["state_is_override"]) == ("cancelled", True)

    client.post(f"/api/courses/{cid}/sessions/{sid}/follow-date")
    released = sessions_of(client)[0]
    assert (released["state"], released["state_is_override"]) == ("pending", False)


def test_today_is_the_pacific_today_not_the_servers(client, db_session, monkeypatch):
    """Render 上服务器跑在 UTC。美西还没跨日、UTC 已经跨日时，
    按服务器日期算会把今晚的课提前标成已上。"""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    # UTC 已是 12-16，美西仍是 12-15
    moment = datetime(2026, 12, 16, 3, 0, tzinfo=ZoneInfo("UTC"))
    assert moment.astimezone(ZoneInfo("America/Los_Angeles")).date() == date(2026, 12, 15)
    monkeypatch.setattr(courses_router, "utcnow", lambda: moment)

    cid = make_course(client)
    add_session(client, cid, local_date="2026-12-15")

    assert sessions_of(client)[0]["state"] == "pending"


def test_illegal_override_is_rejected(client, db_session):
    cid = make_course(client)
    sid = add_session(client, cid).json()["sessions"][0]["id"]

    resp = client.patch(
        f"/api/courses/{cid}/sessions/{sid}", json={"state_override": "放假了"}
    )

    assert resp.status_code == 422


def test_session_can_be_edited_and_deleted(client, db_session):
    cid = make_course(client)
    first = add_session(client, cid, local_date="2026-10-15").json()["sessions"][0]["id"]
    add_session(client, cid, local_date="2026-10-22")

    edited = client.patch(
        f"/api/courses/{cid}/sessions/{first}", json={"teacher": "讲师乙"}
    )
    assert edited.status_code == 200
    assert sessions_of(client)[0]["teacher"] == "讲师乙"

    assert client.delete(f"/api/courses/{cid}/sessions/{first}").status_code == 200
    assert [s["local_date"] for s in sessions_of(client)] == ["2026-10-22"]


def test_session_of_another_course_cannot_be_touched(client, db_session):
    """路径带 course_id；不校验归属，B 课的请求就能改掉 A 课的场次。"""
    a, b = make_course(client, "课程甲"), make_course(client, "课程乙")
    sid = add_session(client, a).json()["sessions"][0]["id"]

    assert client.patch(f"/api/courses/{b}/sessions/{sid}", json={"teacher": "x"}).status_code == 404
    assert client.delete(f"/api/courses/{b}/sessions/{sid}").status_code == 404
    assert len(sessions_of(client, a)) == 1


def test_teacher_options_are_the_distinct_teachers_seen_so_far(client, db_session):
    """讲师不是实体，是场次上出现过的名字去重——界面据此给选项，并允许当场新增。"""
    a = make_course(client, "课程甲")
    b = make_course(client, "课程乙")
    add_session(client, a, teacher="讲师甲")
    add_session(client, b, teacher="讲师乙")
    add_session(client, b, local_date="2026-10-22", teacher="讲师甲")

    resp = client.get("/api/courses/teachers")

    assert resp.status_code == 200
    assert resp.json() == ["讲师乙", "讲师甲"] or resp.json() == ["讲师甲", "讲师乙"]


@pytest.mark.parametrize("bad_tz", ["Mars/Olympus", ""])
def test_unknown_timezone_is_rejected(client, db_session, bad_tz):
    """时区名是给 zoneinfo 用的键；写错了会在读取时炸在换算上，
    那时错误离写入点已经很远。在边界上拦掉。"""
    cid = make_course(client)

    assert add_session(client, cid, tz=bad_tz).status_code == 422
