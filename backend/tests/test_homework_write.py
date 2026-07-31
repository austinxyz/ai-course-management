"""同步写入接口 `PUT /api/homework`。

语义是「这批行的最新状态是这样」——幂等。重复跑不出错，是本次的核心成功标准：
`grades.csv` 会被反复同步，而 CLI 不应该去处理冲突。

接口有意做成"部分成功"：一份 18 行的文件里有 1 行关联不上，不该让另外 17 行也进不来。
关联不上的行分两类，且**两类的处置相反**（一个要先建学员，一个要补报课），
所以响应里是两个字段，不是一个。
"""

from datetime import date

import pytest
from sqlmodel import select

from app.models import Course, CourseAlias, Enrollment, HomeworkSubmission, Student


def _student(session, email: str, name: str = "学员", archived=None) -> Student:
    row = Student(
        email=email, name=name, region="美东", level="小白", source="讲武堂", archived_at=archived
    )
    session.add(row)
    session.commit()
    return row


def _course(session, name="课程甲", short="S1", alias="S1") -> Course:
    course = Course(name=name, short=short)
    session.add(course)
    session.commit()
    session.refresh(course)
    session.add(CourseAlias(alias=alias.lower(), raw=alias, course_id=course.id))
    session.commit()
    return course


def _enroll(session, email: str, course: Course) -> Enrollment:
    row = Enrollment(
        student_email=email, course_id=course.id, enrolled_at=date(2026, 6, 1)
    )
    session.add(row)
    session.commit()
    return row


def _row(email: str, total: int = 77, scores=None, **over) -> dict:
    body = {
        "student_email": email,
        "submitted_at": "2026-06-11",
        "total": total,
        "scores": scores if scores is not None else [{"item": "A1工作流结构", "score": 11}],
        "highlight": "亮点",
        "improve": "改进",
        "reply_status": "待回复",
        "source_ref": "session1/grades.csv:2",
    }
    body.update(over)
    return body


@pytest.fixture
def seeded(db_session):
    """一名学员、一门课（别名 S1）、一条报课 —— 最短的能走通的路径。"""
    course = _course(db_session)
    _student(db_session, "alpha@example.com", "学员甲")
    _enroll(db_session, "alpha@example.com", course)
    return course


def test_replaying_the_same_file_creates_nothing_new(client, db_session, seeded):
    """同一份文件送两遍：第二遍 created 为 0，库里行数不变。

    这是幂等性的整个意义所在。CSV 会被反复同步，如果第二遍要么报 409、
    要么多出一行，同步工具就得自己维护"我上次送到哪了"。
    """
    payload = {"course_alias": "S1", "rows": [_row("alpha@example.com")]}

    first = client.put("/api/homework", json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["created"] == 1
    assert first.json()["updated"] == 0

    second = client.put("/api/homework", json=payload)

    assert second.status_code == 200, second.text
    assert second.json()["created"] == 0
    assert second.json()["updated"] == 1
    assert len(db_session.exec(select(HomeworkSubmission)).all()) == 1


def test_replaying_with_changed_scores_updates_in_place(client, db_session, seeded):
    """csv 里改了分数再同步，库里跟着改。"""
    client.put("/api/homework", json={"course_alias": "S1", "rows": [_row("alpha@example.com")]})

    client.put(
        "/api/homework",
        json={
            "course_alias": "S1",
            "rows": [_row("alpha@example.com", total=91, reply_status="草稿已创建")],
        },
    )

    db_session.expire_all()
    row = db_session.exec(select(HomeworkSubmission)).one()
    assert row.total == 91
    assert row.reply_status == "草稿已创建"


def test_a_row_deleted_from_the_source_does_not_delete_the_record(client, db_session, seeded):
    """覆盖式，不是同步式删除：源文件少了一行，库里那条仍在。"""
    client.put("/api/homework", json={"course_alias": "S1", "rows": [_row("alpha@example.com")]})

    client.put("/api/homework", json={"course_alias": "S1", "rows": []})

    assert len(db_session.exec(select(HomeworkSubmission)).all()) == 1


def test_total_is_taken_verbatim_and_never_recomputed(client, db_session, seeded):
    """总分原样存。

    `session2/grades.csv` 里真实存在一行「总分 ≠ 分项之和」。现算会与源文件
    悄悄不一致，而这一页的全部价值就是忠实反映源文件。
    """
    client.put(
        "/api/homework",
        json={
            "course_alias": "S1",
            "rows": [
                _row(
                    "alpha@example.com",
                    total=73,
                    scores=[
                        {"item": "E1领域与结构", "score": 40},
                        {"item": "E2Wiki数量", "score": 31},
                    ],
                )
            ],
        },
    )

    row = db_session.exec(select(HomeworkSubmission)).one()
    assert row.total == 73  # 不是 71


def test_score_item_order_survives_the_write_path(client, db_session, seeded):
    """经过接口写进去的分项，顺序仍与请求体一致。

    模型层已有同样的断言；这一条盯的是接口层不会在中途把它变成 dict。
    """
    items = [
        {"item": "A1工作流结构", "score": 11},
        {"item": "A2数据传递", "score": 9},
        {"item": "A3Cowork特性", "score": 0},
        {"item": "B1提示词三要素", "score": 13},
        {"item": "D2心得深度", "score": 7},
    ]

    client.put(
        "/api/homework",
        json={"course_alias": "S1", "rows": [_row("alpha@example.com", scores=items)]},
    )

    row = db_session.exec(select(HomeworkSubmission)).one()
    assert [s["item"] for s in row.scores] == [s["item"] for s in items]


class TestSkipLists:
    """两类关联不上的行。**两个字段，不合并** —— 处置相反。"""

    def test_unknown_email_is_skipped_but_the_rest_still_lands(
        self, client, db_session, seeded
    ):
        resp = client.put(
            "/api/homework",
            json={
                "course_alias": "S1",
                "rows": [_row("alpha@example.com"), _row("ghost@example.com")],
            },
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["skipped_no_student"] == ["ghost@example.com"]
        assert body["created"] == 1
        # 好行照常进来了 —— 一行坏的不该让整份文件白跑
        stored = db_session.exec(select(HomeworkSubmission)).all()
        assert [r.student_email for r in stored] == ["alpha@example.com"]

    def test_student_without_enrollment_is_written_and_listed(
        self, client, db_session, seeded
    ):
        """学员在册但这门课没报课：成绩**写入**，同时列出来让人去补报课。

        成绩是有效数据，不该因为报课记录缺失就丢掉。但名单来自报课记录，
        所以这个人在页面上一行都不会出现 —— 不列出来就是静默消失。
        """
        _student(db_session, "bravo@example.com", "学员乙")  # 有学员，无报课

        resp = client.put(
            "/api/homework",
            json={
                "course_alias": "S1",
                "rows": [_row("alpha@example.com"), _row("bravo@example.com")],
            },
        )

        body = resp.json()
        assert body["skipped_no_enrollment"] == ["bravo@example.com"]
        assert body["created"] == 2  # 两条都写了
        stored = {r.student_email for r in db_session.exec(select(HomeworkSubmission)).all()}
        assert stored == {"alpha@example.com", "bravo@example.com"}

    def test_the_two_lists_are_separate_fields(self, client, db_session, seeded):
        """两类同时出现时各归各的，不混成一份。"""
        _student(db_session, "bravo@example.com", "学员乙")

        body = client.put(
            "/api/homework",
            json={
                "course_alias": "S1",
                "rows": [
                    _row("alpha@example.com"),
                    _row("bravo@example.com"),
                    _row("ghost@example.com"),
                ],
            },
        ).json()

        assert body["skipped_no_student"] == ["ghost@example.com"]
        assert body["skipped_no_enrollment"] == ["bravo@example.com"]


class TestCourseResolution:
    """课程由调用方指定，系统不猜 —— 源仓库的目录名已经错了一处。"""

    def test_unknown_alias_rejects_the_whole_request(self, client, db_session, seeded):
        resp = client.put(
            "/api/homework",
            json={"course_alias": "S9", "rows": [_row("alpha@example.com")]},
        )

        assert resp.status_code == 404
        assert "S9" in resp.text
        # 一条都不写：别名错了意味着整份文件都可能挂错课
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_alias_matching_ignores_case_and_padding(self, client, db_session, seeded):
        resp = client.put(
            "/api/homework",
            json={"course_alias": "  s1 ", "rows": [_row("alpha@example.com")]},
        )

        assert resp.status_code == 200, resp.text
        assert db_session.exec(select(HomeworkSubmission)).one().course_id == seeded.id


class TestExplicitNull:
    """NOT NULL 列上的显式 null 在边界被挡下，不是 500。"""

    @pytest.mark.parametrize("field", ["total", "submitted_at", "highlight", "reply_status"])
    def test_explicit_null_on_a_not_null_column_is_rejected(
        self, client, db_session, seeded, field
    ):
        resp = client.put(
            "/api/homework",
            json={"course_alias": "S1", "rows": [_row("alpha@example.com", **{field: None})]},
        )

        assert resp.status_code == 422, resp.text

    def test_empty_scores_is_legal(self, client, db_session, seeded):
        """`scores` 送空数组是合法的：一门课可以只有固定列。"""
        resp = client.put(
            "/api/homework",
            json={"course_alias": "S1", "rows": [_row("alpha@example.com", scores=[])]},
        )

        assert resp.status_code == 200, resp.text
        assert db_session.exec(select(HomeworkSubmission)).one().scores == []


def test_anonymous_callers_are_turned_away(anon_client, db_session, seeded):
    """写接口与其余接口同样受共享 secret 保护。"""
    resp = anon_client.put(
        "/api/homework", json={"course_alias": "S1", "rows": [_row("alpha@example.com")]}
    )

    assert resp.status_code == 401


class TestServerSideDryRun:
    """`?dry_run=true`：算出完整的处置结果，但一条都不写。

    两份跳过清单的判据是"谁在学员表""谁有报课记录"——只有数据库知道。
    所以 dry-run 不能只在本地解析：那样它报不出实际执行会跳过谁，
    而"先看看会发生什么"正是 dry-run 的全部意义。
    """

    def test_dry_run_writes_nothing(self, client, db_session, seeded):
        from sqlmodel import select

        resp = client.put(
            "/api/homework?dry_run=true",
            json={"course_alias": "S1", "rows": [_row("alpha@example.com")]},
        )

        assert resp.status_code == 200, resp.text
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_dry_run_reports_the_same_counts_the_real_run_would(
        self, client, db_session, seeded
    ):
        payload = {"course_alias": "S1", "rows": [_row("alpha@example.com")]}

        dry = client.put("/api/homework?dry_run=true", json=payload).json()
        real = client.put("/api/homework", json=payload).json()

        assert dry == real

    def test_dry_run_reports_both_skip_lists(self, client, db_session, seeded):
        _student(db_session, "bravo@example.com", "学员乙")  # 有学员，无报课

        body = client.put(
            "/api/homework?dry_run=true",
            json={
                "course_alias": "S1",
                "rows": [
                    _row("alpha@example.com"),
                    _row("bravo@example.com"),
                    _row("ghost@example.com"),
                ],
            },
        ).json()

        assert body["skipped_no_student"] == ["ghost@example.com"]
        assert body["skipped_no_enrollment"] == ["bravo@example.com"]

    def test_dry_run_distinguishes_created_from_updated(self, client, db_session, seeded):
        """已经同步过一次之后，dry-run 该说"更新 1 条"而不是"新建 1 条"。"""
        payload = {"course_alias": "S1", "rows": [_row("alpha@example.com")]}
        client.put("/api/homework", json=payload)

        body = client.put("/api/homework?dry_run=true", json=payload).json()

        assert body["created"] == 0
        assert body["updated"] == 1
