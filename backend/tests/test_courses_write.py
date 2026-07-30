"""课程与别名的写契约。"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.models import Course, CourseAlias


def create(client, **kw):
    body = {"name": "课程甲"} | kw
    return client.post("/api/courses", json=body)


def test_only_the_name_is_required(client, db_session):
    """建课时讲师手里往往只有名字；定位、介绍、作业题目都是之后补的。"""
    resp = create(client)

    assert resp.status_code == 201
    assert resp.json()["name"] == "课程甲"
    assert resp.json()["short"] == ""


def test_blank_name_is_rejected(client, db_session):
    """课程名是这门课在所有页面上的称呼，空白等于没有称呼。"""
    resp = create(client, name="   ")

    assert resp.status_code == 422
    assert db_session.exec(select(Course)).all() == []


def test_name_is_stored_trimmed(client, db_session):
    resp = create(client, name="  课程乙  ")

    assert resp.json()["name"] == "课程乙"


def test_partial_update_leaves_other_fields_alone(client, db_session):
    """与学员那边同一套哨兵语义：请求没提到的字段保持原值。"""
    cid = create(client, short="甲", tagline="定位").json()["id"]

    resp = client.patch(f"/api/courses/{cid}", json={"tagline": "新定位"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["tagline"] == "新定位"
    assert body["short"] == "甲"


def test_explicit_null_is_rejected(client, db_session):
    """`None` 表示"这次请求没提到它"。显式 null 撞上同一个值却是另一个意思，
    放进 NOT NULL 列就是未捕获的 500。"""
    cid = create(client).json()["id"]

    resp = client.patch(f"/api/courses/{cid}", json={"tagline": None})

    assert resp.status_code == 422


def test_update_can_blank_the_name_never(client, db_session):
    """空白姓名在更新路径也要被拦——只拦创建等于留了个洞。"""
    cid = create(client).json()["id"]

    resp = client.patch(f"/api/courses/{cid}", json={"name": "  "})

    assert resp.status_code == 422
    assert client.get("/api/courses").json()[0]["name"] == "课程甲"


def test_offline_is_a_field_not_a_deletion(client, db_session):
    """停止招生用下线表达。已下线课程仍在列表里，历史报课与作业不受影响。"""
    cid = create(client).json()["id"]

    resp = client.patch(f"/api/courses/{cid}", json={"offline": True})

    assert resp.status_code == 200
    assert [(c["name"], c["offline"]) for c in client.get("/api/courses").json()] == [
        ("课程甲", True)
    ]


def test_there_is_no_delete_endpoint(client, db_session):
    """设计里课程没有删除入口。真要清理只能直连数据库——存的是共用口径，
    删一门课会让引用它的报课与作业记录失去归属。"""
    cid = create(client).json()["id"]

    resp = client.delete(f"/api/courses/{cid}")

    assert resp.status_code in (404, 405)
    assert len(client.get("/api/courses").json()) == 1


def test_alias_can_be_added_and_removed(client, db_session):
    cid = create(client).json()["id"]

    added = client.post(f"/api/courses/{cid}/aliases", json={"raw": "S1"})
    assert added.status_code == 201
    assert [a["raw"] for a in client.get("/api/courses").json()[0]["aliases"]] == ["S1"]

    removed = client.delete(f"/api/courses/{cid}/aliases/S1")
    assert removed.status_code == 200
    assert client.get("/api/courses").json()[0]["aliases"] == []


def test_alias_differing_only_in_case_or_space_is_the_same_alias(client, db_session):
    """平台导出的写法不受我们控制。`S1` 与 ` s1 ` 是同一个东西，
    不归一化就会在库里留下两条指向同一门课的别名，导入时看着像两个课程口径。"""
    cid = create(client).json()["id"]
    client.post(f"/api/courses/{cid}/aliases", json={"raw": "S1"})

    resp = client.post(f"/api/courses/{cid}/aliases", json={"raw": " s1 "})

    assert resp.status_code == 409
    assert len(client.get("/api/courses").json()[0]["aliases"]) == 1
    # 先到先得：不覆盖已存的写法
    assert client.get("/api/courses").json()[0]["aliases"][0]["raw"] == "S1"


def test_alias_belonging_to_another_course_is_refused(client, db_session):
    """一个别名指向两门课，导入时无从判断归属——这正是别名存在的理由被抵消。"""
    a = create(client, name="课程甲").json()["id"]
    b = create(client, name="课程乙").json()["id"]
    client.post(f"/api/courses/{a}/aliases", json={"raw": "S1"})

    resp = client.post(f"/api/courses/{b}/aliases", json={"raw": "S1"})

    assert resp.status_code == 409
    # 响应要说清是谁占着，界面才能引导过去
    assert "课程甲" in resp.json()["detail"] or a in resp.json()["detail"]
    by_name = {c["name"]: c for c in client.get("/api/courses").json()}
    assert [x["raw"] for x in by_name["课程甲"]["aliases"]] == ["S1"]
    assert by_name["课程乙"]["aliases"] == []


def test_blank_alias_is_rejected(client, db_session):
    cid = create(client).json()["id"]

    resp = client.post(f"/api/courses/{cid}/aliases", json={"raw": "   "})

    assert resp.status_code == 422


def test_database_refuses_a_non_normalized_alias(db_session):
    """DB 层兜底：应用层已经归一化，但绕过 API 的导入脚本不会。
    没有这条约束时，脚本插入 `S1` 之后 `s1` 还能再插一行——两行指同一个逻辑别名，
    唯一性形同虚设。与 students_email_lower_key 同源。"""
    course = Course(name="课程甲")
    db_session.add(course)
    db_session.commit()

    db_session.add(CourseAlias(alias="S1", raw="S1", course_id=course.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_alias_cannot_be_deleted_through_another_course(client, db_session):
    """守卫必须被测到：删除路径带 course_id，若不校验归属，
    B 课的请求就能删掉 A 课的别名——而两边都返回 200，看不出出事。"""
    a = create(client, name="课程甲").json()["id"]
    b = create(client, name="课程乙").json()["id"]
    client.post(f"/api/courses/{a}/aliases", json={"raw": "S1"})

    resp = client.delete(f"/api/courses/{b}/aliases/S1")

    assert resp.status_code == 404
    by_name = {c["name"]: c for c in client.get("/api/courses").json()}
    assert [x["raw"] for x in by_name["课程甲"]["aliases"]] == ["S1"]


def test_deleting_a_missing_alias_is_404_not_a_silent_ok(client, db_session):
    """200 会让调用方以为删掉了。"什么都没发生"和"删成功"必须能区分。"""
    cid = create(client).json()["id"]

    assert client.delete(f"/api/courses/{cid}/aliases/nope").status_code == 404


def test_alias_race_falls_back_to_409_not_500(client, db_session, monkeypatch):
    """两个请求同时加同一个别名时，两边都能通过预查，然后其中一个撞主键。

    未捕获的 IntegrityError 会变成 500——而这在语义上仍然是"别名已被占用"。
    这里把预查打成永远返回 None 来走到那条分支上。
    """
    from app.routers import courses as courses_router

    a = create(client, name="课程甲").json()["id"]
    b = create(client, name="课程乙").json()["id"]
    client.post(f"/api/courses/{a}/aliases", json={"raw": "S1"})
    monkeypatch.setattr(courses_router, "_existing_alias", lambda session, key: None)

    resp = client.post(f"/api/courses/{b}/aliases", json={"raw": "S1"})

    assert resp.status_code == 409




def test_duration_is_recorded_in_minutes(client, db_session):
    """真实课程是 150 分钟。整小时表达不了 2.5 小时——不是边缘情况，是全部四门课。"""
    cid = create(client, duration_minutes=150).json()["id"]

    assert client.get("/api/courses").json()[0]["duration_minutes"] == 150

    patched = client.patch(f"/api/courses/{cid}", json={"duration_minutes": 90})
    assert patched.status_code == 200
    assert client.get("/api/courses").json()[0]["duration_minutes"] == 90


@pytest.mark.parametrize("bad", [0, -1, 14, 601])
def test_duration_out_of_range_is_rejected(client, db_session, bad):
    """0 与负数不是课；上限防手滑多打一个 0。下限 15 分钟。"""
    assert create(client, duration_minutes=bad).status_code == 422

    cid = create(client, name="另一门课").json()["id"]
    before = client.get("/api/courses").json()
    assert client.patch(f"/api/courses/{cid}", json={"duration_minutes": bad}).status_code == 422
    assert client.get("/api/courses").json() == before


def test_course_has_a_default_timezone(client, db_session):
    """课程记住它通常按哪个时区排；新增场次时预选它。"""
    cid = create(client).json()["id"]
    assert client.get("/api/courses").json()[0]["default_tz"] == "America/Los_Angeles"

    resp = client.patch(f"/api/courses/{cid}", json={"default_tz": "America/New_York"})

    assert resp.status_code == 200
    assert client.get("/api/courses").json()[0]["default_tz"] == "America/New_York"


@pytest.mark.parametrize("bad_tz", ["Mars/Olympus", ""])
def test_unknown_default_timezone_is_rejected(client, db_session, bad_tz):
    """写错的时区名会在读取时炸在换算上，那时离写入点已经很远。两条写入路径都要拦。"""
    assert create(client, default_tz=bad_tz).status_code == 422

    cid = create(client, name="第三门课").json()["id"]
    assert client.patch(f"/api/courses/{cid}", json={"default_tz": bad_tz}).status_code == 422
