"""报课记录的唯一性约束。

约束由**数据库结构**保证，不是应用层的判断——绕过接口的直写同样要挡住。
因此这些测试直接对着 session 插入，不走 API。
"""

from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

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

    rows = db_session.exec(
        select(Enrollment).where(Enrollment.student_email == student.email)
    ).all()
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

    rows = db_session.exec(
        select(Enrollment).where(Enrollment.session_id == only.id)
    ).all()
    assert len(rows) == 2


# --- 状态派生 -------------------------------------------------------------
#
# 只存 enrolled / withdrawn。「已完成」不入库，读取时由所属场次派生——
# 没有人会在每次课后回来把十几条记录挨个改成已完成，存下来的状态会腐烂。


def read_states(client, email):
    resp = client.get("/api/enrollments", params={"student": email})
    assert resp.status_code == 200
    return [row["state"] for row in resp.json()]


def test_past_session_reads_as_completed_but_is_stored_as_enrolled(client, db_session):
    student = seed_student(db_session)
    course = seed_course(db_session)
    past = seed_session(db_session, course, "2020-01-01")
    row = enroll(db_session, student, course, past)

    assert read_states(client, student.email) == ["completed"]
    # 库里没有存过这个状态——这正是这条设计的要点
    db_session.refresh(row)
    assert row.status == "enrolled"


def test_enrollment_without_a_session_reads_as_enrolled(client, db_session):
    student = seed_student(db_session)
    course = seed_course(db_session)
    enroll(db_session, student, course, None)

    assert read_states(client, student.email) == ["enrolled"]


def test_future_session_reads_as_enrolled(client, db_session):
    student = seed_student(db_session)
    course = seed_course(db_session)
    later = seed_session(db_session, course, "2099-01-01")
    enroll(db_session, student, course, later)

    assert read_states(client, student.email) == ["enrolled"]


def test_cancelled_session_does_not_count_as_completed(client, db_session):
    """课没上成，人还欠一场——所以是「报名」，不是「已完成」。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    past = seed_session(db_session, course, "2020-01-01")
    past.state_override = "cancelled"
    db_session.add(past)
    db_session.commit()
    enroll(db_session, student, course, past)

    assert read_states(client, student.email) == ["enrolled"]


def test_withdrawn_overrides_the_derived_state(client, db_session):
    """退课是存下来的那一个，它压倒派生：场次早就上过了也仍是退课。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    past = seed_session(db_session, course, "2020-01-01")
    enroll(db_session, student, course, past, status="withdrawn")

    assert read_states(client, student.email) == ["withdrawn"]


# --- 写入 -----------------------------------------------------------------


def test_create_keeps_every_field_the_form_collects(client, db_session):
    """新建路径要真正处理**所有**字段，不只是必填的那几个。

    只送必填字段、其余被静默丢弃是这个项目踩过的坑：后端有默认值所以不报错，
    而"先建最简记录、再逐个编辑"的验收流程根本走不到新建路径的字段处理。
    """
    student = seed_student(db_session)
    course = seed_course(db_session)
    only = seed_session(db_session, course)

    resp = client.post(
        "/api/enrollments",
        json={
            "student_email": student.email,
            "course_id": str(course.id),
            "session_id": str(only.id),
            "enrolled_at": "2026-05-04",
            "note": "线下转账，平台漏记",
        },
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["session_id"] == str(only.id)
    assert body["enrolled_at"] == "2026-05-04"
    assert body["note"] == "线下转账，平台漏记"
    assert body["source"] == "manual"


def test_moving_to_a_later_session_brings_the_state_back_to_enrolled(client, db_session):
    """没上成、要补后面那一场——改场次即可，不需要状态覆盖。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    past = seed_session(db_session, course, "2020-01-01")
    later = seed_session(db_session, course, "2099-01-01")
    row = enroll(db_session, student, course, past)
    assert read_states(client, student.email) == ["completed"]

    resp = client.patch(f"/api/enrollments/{row.id}", json={"session_id": str(later.id)})

    assert resp.status_code == 200
    assert resp.json()["state"] == "enrolled"


def test_clearing_the_session_brings_the_state_back_to_enrolled(client, db_session):
    """还没定补哪一场：清空场次，落进"未定场次"那一类。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    past = seed_session(db_session, course, "2020-01-01")
    row = enroll(db_session, student, course, past)

    resp = client.patch(f"/api/enrollments/{row.id}", json={"session_id": None})

    assert resp.status_code == 200
    assert resp.json()["state"] == "enrolled"
    assert resp.json()["session_id"] is None


def test_withdraw_and_restore(client, db_session):
    student = seed_student(db_session)
    course = seed_course(db_session)
    later = seed_session(db_session, course, "2099-01-01")
    row = enroll(db_session, student, course, later)

    assert client.patch(f"/api/enrollments/{row.id}", json={"status": "withdrawn"}).json()["state"] == "withdrawn"
    # 标错了要能撤销
    assert client.patch(f"/api/enrollments/{row.id}", json={"status": "enrolled"}).json()["state"] == "enrolled"


def test_delete_removes_the_record(client, db_session):
    """删除 ≠ 退课：退课是"发生过"，删除是"这条记录本身录错了"。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    row = enroll(db_session, student, course, None)

    assert client.delete(f"/api/enrollments/{row.id}").status_code == 204
    assert read_states(client, student.email) == []


def test_cannot_enroll_into_an_offline_course(client, db_session):
    """下线是"不再招生"，所以新建被拒。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    course.offline = True
    db_session.add(course)
    db_session.commit()

    resp = client.post(
        "/api/enrollments",
        json={
            "student_email": student.email,
            "course_id": str(course.id),
            "enrolled_at": "2026-05-04",
        },
    )

    assert resp.status_code == 409


def test_existing_enrollments_of_an_offline_course_still_show(client, db_session):
    """下线不是"这门课没发生过"——既有报课照常返回。"""
    student = seed_student(db_session)
    course = seed_course(db_session)
    enroll(db_session, student, course, None)
    course.offline = True
    db_session.add(course)
    db_session.commit()

    assert read_states(client, student.email) == ["enrolled"]


def test_a_session_from_another_course_is_rejected(client, db_session):
    """场次必须属于这条报课的课程。

    不校验的话，A 课的场次能挂到 B 课的报课上，而状态是从"所属场次"派生的——
    于是这条报课会按一个毫不相干的日期显示已完成。库里没有跨表的复合外键
    能表达这条，所以只能在边界上挡。
    """
    student = seed_student(db_session)
    mine = seed_course(db_session, "课程甲")
    other = seed_course(db_session, "课程乙")
    stranger = seed_session(db_session, other)

    resp = client.post(
        "/api/enrollments",
        json={
            "student_email": student.email,
            "course_id": str(mine.id),
            "session_id": str(stranger.id),
            "enrolled_at": "2026-05-04",
        },
    )

    assert resp.status_code == 422


def test_moving_to_a_session_of_another_course_is_rejected(client, db_session):
    student = seed_student(db_session)
    mine = seed_course(db_session, "课程甲")
    other = seed_course(db_session, "课程乙")
    stranger = seed_session(db_session, other)
    row = enroll(db_session, student, mine, None)

    resp = client.patch(f"/api/enrollments/{row.id}", json={"session_id": str(stranger.id)})

    assert resp.status_code == 422


def test_explicit_null_on_a_not_null_column_is_refused(client, db_session):
    """`None` 表示"这次请求没提到它"（配合 model_fields_set）。

    客户端显式传 null 解析成同一个值却是另一个意思，而这两列都是 NOT NULL——
    放进去就是未捕获的 500。没有第三种状态可编码，只能在边界上拒绝。

    `session_id` 不在此列：它本来就可空，显式 null 是合法的"清空场次"。
    """
    student = seed_student(db_session)
    course = seed_course(db_session)
    row = enroll(db_session, student, course, None)

    assert client.patch(f"/api/enrollments/{row.id}", json={"enrolled_at": None}).status_code == 422
    assert client.patch(f"/api/enrollments/{row.id}", json={"note": None}).status_code == 422
    # 对照：场次上的显式 null 仍然是合法的清空
    assert client.patch(f"/api/enrollments/{row.id}", json={"session_id": None}).status_code == 200


# --- 来源 -----------------------------------------------------------------
#
# 三种：manual（人特意录的）/ platform（平台同步）/ derived（从别处倒推的占位）。
# 三者的区别对将来的平台导入有约束力——"人特意录的"与"系统推出来的占位"
# 在被平台数据覆盖这件事上恰好相反，塞进同一个值就分不出哪些能覆盖。


def post_enrollment(client, student, course, **extra):
    body = {
        "student_email": student.email,
        "course_id": str(course.id),
        "enrolled_at": "2026-05-04",
        **extra,
    }
    return client.post("/api/enrollments", json=body)


def test_manual_is_the_default_source(client, db_session):
    """界面补录不传 source，落 manual。"""
    student = seed_student(db_session)
    course = seed_course(db_session)

    resp = post_enrollment(client, student, course)

    assert resp.status_code == 201
    assert resp.json()["source"] == "manual"


def test_derived_source_is_stored_as_given(client, db_session):
    """倒推脚本要能把记录标成 derived，否则将来分不出哪些可以被平台数据覆盖。"""
    student = seed_student(db_session)
    course = seed_course(db_session)

    resp = post_enrollment(client, student, course, source="derived")

    assert resp.status_code == 201
    assert resp.json()["source"] == "derived"


def test_an_unknown_source_is_refused(client, db_session):
    """列上没有 CHECK 约束（给未来留口子），所以取值只能在边界上挡。

    不挡的话第四种值会悄悄进来，而计数与将来的覆盖规则都是按三值写的。
    """
    student = seed_student(db_session)
    course = seed_course(db_session)

    resp = post_enrollment(client, student, course, source="imported")

    assert resp.status_code == 422
