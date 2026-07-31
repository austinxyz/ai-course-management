"""作业名单：`GET /api/homework?course=<id>`。

这一页要回答的是「这门课谁没交」。所以名单的驱动表是**报课记录**，
作业是外连接上去的——反过来以作业为驱动表会漏掉所有没交的人，
也就是恰好漏掉这一页存在的理由。

夹具里的邮箱一律带 `hw-` 前缀。清表 fixture 有意不清 `students`（当时的理由是
"测试用 @example.com，撞不上"），但那个理由不成立：本地为截图、验收造的演示数据
按隐私规则**也只能用** @example.com，于是撞是迟早的事——本次就撞了
（演示数据里的 `missing@example.com`），症状是**四个不相干的测试红在 setup 阶段**。
前缀让本文件的夹具只与自己撞。
"""

from datetime import date, datetime, timedelta, time

import pytest
from sqlmodel import Session

from app.models import (
    Course,
    CourseSession,
    Enrollment,
    HomeworkSubmission,
    Student,
)

PAST = date.today() - timedelta(days=30)
FUTURE = date.today() + timedelta(days=30)


def _student(session: Session, email: str, name: str, *, archived: datetime | None = None):
    session.add(
        Student(
            email=email,
            name=name,
            region="美东",
            level="小白",
            source="讲武堂",
            archived_at=archived,
        )
    )
    session.commit()


def _course(session: Session, name="课程甲", short="S1") -> Course:
    course = Course(name=name, short=short)
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def _session(session: Session, course: Course, day: date, *, override: str | None = None):
    row = CourseSession(
        course_id=course.id,
        local_date=day,
        local_time=time(19, 30),
        teacher="讲师",
        state_override=override,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def _enroll(session: Session, email: str, course: Course, sess=None, *, status="enrolled"):
    row = Enrollment(
        student_email=email,
        course_id=course.id,
        session_id=sess.id if sess else None,
        enrolled_at=date(2026, 6, 1),
        status=status,
    )
    session.add(row)
    session.commit()
    return row


def _submit(session: Session, email: str, course: Course, total=77, **over):
    row = HomeworkSubmission(
        student_email=email,
        course_id=course.id,
        submitted_at=date(2026, 6, 11),
        total=total,
        scores=[{"item": "A1工作流结构", "score": total}],
        highlight=over.pop("highlight", "亮点"),
        improve=over.pop("improve", "改进"),
        reply_status=over.pop("reply_status", "待回复"),
        source_ref=over.pop("source_ref", "session1/grades.csv:2"),
    )
    session.add(row)
    session.commit()
    return row


def _fetch(client, course: Course) -> list[dict]:
    resp = client.get(f"/api/homework?course={course.id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _by_email(rows: list[dict]) -> dict[str, dict]:
    return {r["student_email"]: r for r in rows}


class TestFourStates:
    """四态。三态不够：倒推进来的报课全是未定场次，而没有场次就没有截止时间，
    把他算作未交等于制造一个催不了的催促目标。"""

    @pytest.fixture
    def scene(self, db_session):
        course = _course(db_session)
        done = _session(db_session, course, PAST)
        upcoming = _session(db_session, course, FUTURE)

        _student(db_session, "hw-submitted@example.com", "已交甲")
        _enroll(db_session, "hw-submitted@example.com", course, done)
        _submit(db_session, "hw-submitted@example.com", course)

        _student(db_session, "hw-missing@example.com", "未交乙")
        _enroll(db_session, "hw-missing@example.com", course, done)

        _student(db_session, "hw-waiting@example.com", "未开放丙")
        _enroll(db_session, "hw-waiting@example.com", course, upcoming)

        _student(db_session, "hw-nosession@example.com", "未定场次丁")
        _enroll(db_session, "hw-nosession@example.com", course, None)
        return course

    def test_each_person_gets_exactly_one_state(self, client, scene):
        rows = _by_email(_fetch(client, scene))

        assert rows["hw-submitted@example.com"]["state"] == "submitted"
        assert rows["hw-missing@example.com"]["state"] == "missing"
        assert rows["hw-waiting@example.com"]["state"] == "not_open"
        assert rows["hw-nosession@example.com"]["state"] == "no_session"

    def test_unscheduled_is_not_folded_into_missing(self, client, scene):
        """未定场次不进未交。没有场次就没有截止时间，催他是冤的。"""
        rows = _by_email(_fetch(client, scene))

        missing = [r for r in rows.values() if r["state"] == "missing"]
        assert [r["student_email"] for r in missing] == ["hw-missing@example.com"]


class TestSessionStateIsNotRecomputed:
    """「场次已结束」必须与课程页一致，不得另写日期比较。

    两处各算一遍必然在某个边界上分叉，而这里的分叉症状（某人被误催）
    只有收件人看得到。
    """

    def test_a_cancelled_past_session_is_not_treated_as_done(self, client, db_session):
        course = _course(db_session)
        # 日期已过，但人工标记为已取消——课没上成
        cancelled = _session(db_session, course, PAST, override="cancelled")
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, cancelled)

        rows = _by_email(_fetch(client, course))

        assert rows["hw-alpha@example.com"]["state"] != "missing"

    def test_a_past_session_manually_marked_pending_is_not_missing(self, client, db_session):
        course = _course(db_session)
        overridden = _session(db_session, course, PAST, override="pending")
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, overridden)

        rows = _by_email(_fetch(client, course))

        assert rows["hw-alpha@example.com"]["state"] == "not_open"


class TestDeduplication:
    """作业按人计，不按报课记录计（`enrollment` spec 已定）。

    重复来听是"加深印象"，不是重修——再催她交一遍作业是打扰。
    """

    def test_two_enrollments_yield_one_row(self, client, db_session):
        course = _course(db_session)
        first = _session(db_session, course, PAST)
        second = _session(db_session, course, PAST - timedelta(days=7))
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, first)
        _enroll(db_session, "hw-alpha@example.com", course, second)

        rows = _fetch(client, course)

        assert len(rows) == 1

    def test_merging_keeps_the_most_lenient_state(self, client, db_session):
        """一条指向已结束的场次、一条指向未来的场次，且没有提交 → 未开放。

        这一条专门盯"取第一条"那种写法：读接口没有 ORDER BY 时"第一条"
        每次可能是不同的行，于是同一个人时而未交、时而未开放。
        而错的方向是会**误催**的那一边。
        """
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, _session(db_session, course, PAST))
        _enroll(db_session, "hw-alpha@example.com", course, _session(db_session, course, FUTURE))

        rows = _fetch(client, course)

        assert len(rows) == 1
        assert rows[0]["state"] == "not_open"

    def test_a_submission_wins_over_everything(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, _session(db_session, course, PAST))
        _enroll(db_session, "hw-alpha@example.com", course, None)
        _submit(db_session, "hw-alpha@example.com", course)

        rows = _fetch(client, course)

        assert len(rows) == 1
        assert rows[0]["state"] == "submitted"


class TestExcludedFromTheRoster:
    """归档与退课都不进名单。

    这里的计数**直接导向"催谁"**，催一个已归档或已退课的人是错的。
    这与报课页「已报人数不排除已归档学员」有意不同：那边是历史事实的统计。
    """

    def test_archived_students_are_absent(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "在读甲")
        _enroll(db_session, "hw-alpha@example.com", course, None)
        _student(db_session, "hw-gone@example.com", "已归档乙", archived=datetime(2026, 7, 1))
        _enroll(db_session, "hw-gone@example.com", course, None)

        rows = _fetch(client, course)

        assert [r["student_email"] for r in rows] == ["hw-alpha@example.com"]

    def test_archived_students_keep_their_submission_in_the_database(self, client, db_session):
        """成绩本身还在库里——归档是可撤销的，恢复之后不该要求重跑同步。"""
        from sqlmodel import select

        course = _course(db_session)
        _student(db_session, "hw-gone@example.com", "已归档乙", archived=datetime(2026, 7, 1))
        _enroll(db_session, "hw-gone@example.com", course, None)
        _submit(db_session, "hw-gone@example.com", course)

        assert _fetch(client, course) == []
        assert len(db_session.exec(select(HomeworkSubmission)).all()) == 1

    def test_withdrawn_enrollments_are_absent(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "hw-quit@example.com", "退课丙")
        _enroll(db_session, "hw-quit@example.com", course, None, status="withdrawn")

        assert _fetch(client, course) == []

    def test_a_person_with_one_active_and_one_withdrawn_enrollment_stays(
        self, client, db_session
    ):
        """退课的是那条记录，不是那个人。"""
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, None, status="withdrawn")
        _enroll(db_session, "hw-alpha@example.com", course, _session(db_session, course, PAST))

        rows = _fetch(client, course)

        assert len(rows) == 1
        assert rows[0]["state"] == "missing"


class TestRanking:
    def test_rank_is_by_total_within_the_course(self, client, db_session):
        course = _course(db_session)
        for email, total in [("hw-a@example.com", 90), ("hw-b@example.com", 80), ("hw-c@example.com", 70)]:
            _student(db_session, email, email[0])
            _enroll(db_session, email, course, None)
            _submit(db_session, email, course, total=total)

        rows = _by_email(_fetch(client, course))

        assert rows["hw-a@example.com"]["rank"] == 1
        assert rows["hw-b@example.com"]["rank"] == 2
        assert rows["hw-c@example.com"]["rank"] == 3
        assert rows["hw-a@example.com"]["rank_of"] == 3

    def test_ties_are_broken_deterministically(self, client, db_session):
        """同分的名次与相对顺序在两次请求之间必须一致。

        排序键打不破并列的话，两个 90 分的人谁是第 1 会随堆顺序抖动——
        而堆顺序会因为任何一次写入而变。
        """
        course = _course(db_session)
        for email, total in [("hw-a@example.com", 90), ("hw-b@example.com", 90), ("hw-c@example.com", 80)]:
            _student(db_session, email, email[0])
            _enroll(db_session, email, course, None)
            _submit(db_session, email, course, total=total)

        first = {r["student_email"]: r["rank"] for r in _fetch(client, course)}
        second = {r["student_email"]: r["rank"] for r in _fetch(client, course)}

        assert first == second
        assert sorted(first.values()) == [1, 2, 3]

    def test_people_without_a_submission_have_no_rank(self, client, db_session):
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, None)

        assert _fetch(client, course)[0]["rank"] is None


class TestPayload:
    def test_a_submitted_row_carries_everything_the_detail_panel_needs(
        self, client, db_session
    ):
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, None)
        _submit(
            db_session,
            "hw-alpha@example.com",
            course,
            total=77,
            reply_status="草稿已创建",
            source_ref="session1/grades.csv:7",
        )

        row = _fetch(client, course)[0]

        assert row["name"] == "学员甲"
        assert row["total"] == 77
        assert row["submitted_at"] == "2026-06-11"
        assert row["scores"] == [{"item": "A1工作流结构", "score": 77}]
        assert row["highlight"] == "亮点"
        assert row["improve"] == "改进"
        # 原样，不归一化
        assert row["reply_status"] == "草稿已创建"
        assert row["source_ref"] == "session1/grades.csv:7"

    def test_a_row_without_a_submission_is_empty_not_zero(self, client, db_session):
        """没交的人总分是 null，不是 0 —— 0 是一个真实的分数。"""
        course = _course(db_session)
        _student(db_session, "hw-alpha@example.com", "学员甲")
        _enroll(db_session, "hw-alpha@example.com", course, None)

        row = _fetch(client, course)[0]

        assert row["total"] is None
        assert row["scores"] == []
        assert row["reply_status"] == ""

    def test_rows_are_ordered_deterministically(self, client, db_session):
        """名单本身也要有确定顺序——没有 ORDER BY 的话，编辑过的记录会跑到最后。"""
        course = _course(db_session)
        for email in ["hw-c@example.com", "hw-a@example.com", "hw-b@example.com"]:
            _student(db_session, email, f"学员{email[0]}")
            _enroll(db_session, email, course, None)

        first = [r["student_email"] for r in _fetch(client, course)]
        second = [r["student_email"] for r in _fetch(client, course)]

        assert first == second


def test_another_course_is_not_included(client, db_session):
    course = _course(db_session)
    other = _course(db_session, name="课程乙", short="S2")
    _student(db_session, "hw-alpha@example.com", "学员甲")
    _enroll(db_session, "hw-alpha@example.com", course, None)
    _enroll(db_session, "hw-alpha@example.com", other, None)

    assert len(_fetch(client, course)) == 1


def test_a_course_with_no_enrollments_returns_an_empty_list(client, db_session):
    course = _course(db_session)

    assert _fetch(client, course) == []


def test_anonymous_callers_are_turned_away(anon_client, db_session):
    course = _course(db_session)

    assert anon_client.get(f"/api/homework?course={course.id}").status_code == 401
