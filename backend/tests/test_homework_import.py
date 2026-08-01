"""导入接口 `POST /api/homework/import`。

**唯一一条进库的路。** 解码、解析、校验、排除、分类全在这一个端点里——
已知的下一个调用方是 MCP（批改 skill 改完直接上传），它不经过 Next.js，
所以任何落在 Server Action 里的规则都会被那条路径绕过，
而两个客户端行为不一致只在"命令行导进去的和网页导进去的不一样"时才暴露。

返回体因此必须**自描述**：MCP 那边没有人在看屏幕，只能靠返回值判断。

夹具一律用虚构姓名与 @example.com——真实学员数据不进仓库。
"""

import base64
from datetime import date

import pytest
from sqlmodel import select

from app.routers.homework import MAX_UPLOAD_BYTES
from app.models import (
    Course,
    CourseAlias,
    Enrollment,
    HomeworkExcludedEmail,
    HomeworkImport,
    HomeworkSubmission,
    Student,
)

S1_HEADER = ["姓名", "邮件", "提交时间", "总分", "A1工作流结构", "D2心得深度", "亮点", "改进建议", "回复状态"]
S2_HEADER = ["姓名", "邮件", "提交时间", "总分", "E1领域与结构", "G2心得深度", "亮点", "改进建议", "回复状态"]


def _csv(header: list[str], *rows: list[str]) -> str:
    return "\n".join([",".join(header), *(",".join(r) for r in rows)]) + "\n"


def _b64(text: str, encoding: str = "utf-8") -> str:
    """文本 → 上传上来的那串 base64。

    走一遍真实的字节路径（编码 → base64），而不是直接把 str 塞进请求体：
    编码判定的全部意义就在于服务端拿到的是**字节**。
    """
    return base64.b64encode(text.encode(encoding)).decode("ascii")


def _student(session, email: str, name: str = "学员") -> Student:
    row = Student(email=email, name=name, region="美东", level="小白", source="讲武堂")
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
    session.add(Enrollment(student_email=email, course_id=course.id, enrolled_at=date(2026, 6, 1)))
    session.commit()


@pytest.fixture
def seeded(db_session):
    """一名学员、一门课（别名 S1）、一条报课——最短的能走通的路径。"""
    course = _course(db_session)
    _student(db_session, "alpha@example.com", "学员甲")
    _enroll(db_session, "alpha@example.com", course)
    return course


def _import(client, course, text: str, *, dry_run: bool, encoding: str = "utf-8", **over):
    body = {
        "content_base64": _b64(text, encoding),
        "filename": "session1/grades.csv",
        "course_id": str(course.id) if course is not None else None,
    }
    body.update(over)
    return client.post(f"/api/homework/import?dry_run={str(dry_run).lower()}", json=body)


class TestDryRun:
    def test_dry_run_reports_everything_and_writes_nothing(self, client, db_session, seeded):
        """预览要能独立回答"确认之后会发生什么"，且**一条都不写**。

        判据里的两份跳过清单只有数据库知道（谁在学员表、谁有该课的报课记录），
        所以 dry-run 不能只在调用方本地算——那样它报不出实际会跳过谁，
        而"先看看会发生什么"正是 dry-run 的全部意义。
        """
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "亮点", "改进", "待回复"],
            ["学员乙", "bravo@example.com", "2026-06-11", "60", "9", "5", "", "", ""],
        )

        response = _import(client, seeded, text, dry_run=True)

        assert response.status_code == 200
        body = response.json()
        # 编码**始终**报出来，包括判定为 UTF-8 时：只在异常时出现的话，
        # 用户永远不知道正常长什么样，也就无从判断这次是不是异常。
        assert body["encoding"] == "utf-8"
        assert body["row_count"] == 2
        assert body["created"] == 1
        assert body["updated"] == 0
        # 两份清单**彼此分开**：处置相反，一个要先建学员，一个要补报课记录。
        assert body["skipped_no_student"] == ["bravo@example.com"]
        assert body["skipped_no_enrollment"] == []
        assert body["superseded"] == []
        assert body["rows_without_email"] == []
        assert body["excluded"] == []

        # 库里一条都没有。这是 dry-run 唯一不可让步的断言。
        assert db_session.exec(select(HomeworkSubmission)).all() == []


class TestWrite:
    def test_the_real_run_writes_and_agrees_with_the_preview(self, client, db_session, seeded):
        """预览说会发生什么，真跑就得发生什么。

        用户确认的是**预览上那几个数字**。两条代码路径分别算一遍的话，
        它们会在某个边界上分叉，而分叉之后用户点下的"确认导入 16 条"
        写进去的是另一个数——且只在事后对着页面计数才看得出来。
        所以这里直接断言两次返回体逐字段相同。
        """
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "亮点", "改进", "待回复"],
            ["学员乙", "bravo@example.com", "2026-06-11", "60", "9", "5", "", "", ""],
        )

        preview = _import(client, seeded, text, dry_run=True).json()
        real = _import(client, seeded, text, dry_run=False)

        assert real.status_code == 200
        assert real.json() == preview

        written = db_session.exec(select(HomeworkSubmission)).all()
        assert [row.student_email for row in written] == ["alpha@example.com"]
        assert written[0].total == 77
        assert written[0].submitted_at == date(2026, 6, 11)
        # 分项列的先后是评分表分组结构的唯一载体，所以断言的是**有序序列**。
        assert [s["item"] for s in written[0].scores] == ["A1工作流结构", "D2心得深度"]
        assert [s["score"] for s in written[0].scores] == [11, 7]
        assert written[0].reply_status == "待回复"

    def test_replaying_the_same_file_creates_nothing_new(self, client, db_session, seeded):
        """幂等。csv 会被反复导入，第二遍要么报错要么多出一行的话，
        调用方就得自己记住"我上次导到哪了"。"""
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "亮点", "改进", "待回复"],
        )

        _import(client, seeded, text, dry_run=False)
        second = _import(client, seeded, text, dry_run=False).json()

        assert second["created"] == 0
        assert second["updated"] == 1
        assert len(db_session.exec(select(HomeworkSubmission)).all()) == 1


class TestCourseArgument:
    """课程由调用方**显式指定**，不从文件名、路径或内容推断。

    源仓库的目录名已经错了一处：`session3/` 与 `session4/` 的 rubric 是对调的，
    `session4/` 整个目录是 S3 的空壳。路径看起来是可靠线索，实际不是。
    """

    def test_alias_alone_resolves(self, client, db_session, seeded):
        """MCP 那条路手里只有"这是 S1"这个概念，没有 uuid。

        逼它先查一遍课程列表按名字匹配，等于把别名表的职责重写一遍在调用方。
        """
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        response = _import(
            client, None, text, dry_run=False, course_id=None, course_alias="s1"
        )

        assert response.status_code == 200
        assert response.json()["created"] == 1
        written = db_session.exec(select(HomeworkSubmission)).all()
        assert written[0].course_id == seeded.id

    def test_id_wins_when_both_are_given(self, client, db_session, seeded):
        """别名**指向另一门课**，断言成绩写进了 `course_id` 那一门。

        两个都给且一致的话，这条测试对任何实现都成立——必须让两者指向
        不同的课，才分得出实现到底以谁为准。
        """
        other = _course(db_session, name="课程乙", short="S2", alias="S2")
        _enroll(db_session, "alpha@example.com", other)
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        response = _import(client, seeded, text, dry_run=False, course_alias="s2")

        assert response.status_code == 200
        written = db_session.exec(select(HomeworkSubmission)).all()
        assert [row.course_id for row in written] == [seeded.id]

    def test_neither_given_is_rejected_and_writes_nothing(self, client, db_session, seeded):
        """整份拒绝，不是"猜一门"。一次挂错课会静默覆盖整门课的成绩。"""
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        response = _import(client, None, text, dry_run=False, course_id=None)

        assert response.status_code == 422
        assert "课程" in response.json()["detail"]
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_an_unknown_alias_is_rejected(self, client, db_session, seeded):
        """别名错了意味着整份文件都可能挂错课，所以拒绝的是整个请求。"""
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        response = _import(
            client, None, text, dry_run=False, course_id=None, course_alias="S9"
        )

        assert response.status_code == 404
        assert "S9" in response.json()["detail"]
        assert db_session.exec(select(HomeworkSubmission)).all() == []


class TestWriteList:
    """预览要列得出**将写入的那些人**，每一行带着邮箱。

    没有这份清单的话，"在预览的每一行上把该邮箱加入排除名单"就只能作用在
    几份跳过清单上——而恰恰是那些**会被写进去**的行最需要这个控件：
    讲师本人一旦被加进学员表，他的测试提交就从"跳过"变成"将写入"，
    那时候界面上反而没有地方标记他了。
    """

    def test_the_rows_that_will_be_written_are_listed_with_their_emails(
        self, client, db_session, seeded
    ):
        _student(db_session, "bravo@example.com", "学员乙")
        _enroll(db_session, "bravo@example.com", seeded)
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
            ["学员乙", "bravo@example.com", "2026-06-11", "60", "9", "5", "", "", ""],
            ["查无此人", "ghost@example.com", "2026-06-11", "50", "8", "4", "", "", ""],
        )

        body = _import(client, seeded, text, dry_run=True).json()

        # 只列会写进去的，不含跳过的——两者处置不同，混在一起就分不出了。
        assert [row["email"] for row in body["rows"]] == [
            "alpha@example.com",
            "bravo@example.com",
        ]
        # 姓名只为可读，关联一律走邮箱（微信昵称与姓名都会变）。
        assert body["rows"][0]["name"] == "学员甲"
        assert body["rows"][0]["total"] == 77
        # 新建还是更新要分得出：确认按钮上的数字由它们汇总而来。
        assert body["rows"][0]["action"] == "create"

    def test_an_existing_grade_is_marked_as_an_update(self, client, seeded):
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )
        _import(client, seeded, text, dry_run=False)

        body = _import(client, seeded, text, dry_run=True).json()

        assert body["rows"][0]["action"] == "update"

    def test_excluded_people_are_not_in_the_write_list(self, client, db_session, seeded):
        db_session.add(HomeworkExcludedEmail(email="alpha@example.com"))
        db_session.commit()
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        body = _import(client, seeded, text, dry_run=True).json()

        assert body["rows"] == []
        assert body["excluded"] == ["alpha@example.com"]


class TestExcludedEmails:
    """「不算作业的邮箱」是**持久数据**，不是每次导入现给的参数。

    讲师本人的测试提交在 session1/grades.csv 里出现两次，两行的姓名列还不一样。
    它们目前不在库里的唯一原因是他不在学员表里——那是**巧合，不是排除**；
    他被加进学员名单的那天，两条测试提交就会静默变成真实成绩，还带着假名字。
    """

    def test_an_excluded_email_is_not_written_and_is_reported(
        self, client, db_session, seeded
    ):
        """悄悄少写一行与"数据本来就没有"分不出来，所以必须报出来。"""
        db_session.add(HomeworkExcludedEmail(email="alpha@example.com", note="讲师测试提交"))
        db_session.commit()
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        body = _import(client, seeded, text, dry_run=False).json()

        assert body["excluded"] == ["alpha@example.com"]
        assert body["created"] == 0
        # 已排除的人不该再出现在"不在学员表"那份清单里——他不是待处理项。
        assert body["skipped_no_student"] == []
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_marking_an_email_lowers_created_by_one(self, client, db_session, seeded):
        """预览里标记一个人之后，整屏的数字要跟着变。

        断言的是**重新请求一次预览**得到的数，不是前端自己减出来的——
        前端加减会得出一个后端并不认同的数，而不一致只在写入之后才暴露。
        """
        _student(db_session, "bravo@example.com", "学员乙")
        _enroll(db_session, "bravo@example.com", seeded)
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
            ["学员乙", "bravo@example.com", "2026-06-11", "60", "9", "5", "", "", ""],
        )
        before = _import(client, seeded, text, dry_run=True).json()
        assert before["created"] == 2

        added = client.post("/api/homework/excluded", json={"email": "bravo@example.com"})
        assert added.status_code in (200, 201)

        after = _import(client, seeded, text, dry_run=True).json()

        assert after["created"] == 1
        assert after["excluded"] == ["bravo@example.com"]

    def test_the_list_applies_to_every_course(self, client, db_session, seeded):
        """全课程通用：讲师的测试提交在哪门课都不该算。

        按课程分会让"我上次是不是标过"变成一个要逐课回忆的问题。
        """
        other = _course(db_session, name="课程乙", short="S2", alias="S2")
        _enroll(db_session, "alpha@example.com", other)
        db_session.add(HomeworkExcludedEmail(email="alpha@example.com"))
        db_session.commit()
        text = _csv(
            S2_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-20", "70", "10", "6", "", "", ""],
        )

        body = _import(client, other, text, dry_run=False).json()

        assert body["excluded"] == ["alpha@example.com"]
        assert db_session.exec(select(HomeworkSubmission)).all() == []


class TestHeaderWarning:
    """分项列与该课程既有成绩不符时**警告，但不拒绝**。

    这个信号最常见的成因是传错了课程，而那不是"数据缺口"这类提示能表达清楚的。
    但直接拒绝会在课程真的改了评分表时卡死，而改评分表是合法的。
    """

    def test_different_items_warn_and_still_allow_confirming(
        self, client, db_session, seeded
    ):
        text_s1 = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )
        _import(client, seeded, text_s1, dry_run=False)

        # 同一门课，换成一套完全不同的分项列——典型的"传错了课程"。
        text_s2 = _csv(
            S2_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-20", "70", "10", "6", "", "", ""],
        )
        response = _import(client, seeded, text_s2, dry_run=True)

        assert response.status_code == 200
        warning = response.json()["header_warning"]
        assert warning is not None
        # 两边都列出来：只说"不一致"的话，人没法判断是传错了还是改了评分表。
        assert warning["file_items"] == ["E1领域与结构", "G2心得深度"]
        assert warning["existing_items"] == ["A1工作流结构", "D2心得深度"]
        # 警告不是拒绝：确认之后照样写得进去。
        assert response.json()["updated"] == 1

    def test_no_warning_when_the_course_has_no_grades_yet(self, client, seeded):
        """没有可比对的既有列，就没有"不符"可言。"""
        text = _csv(
            S2_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-20", "70", "10", "6", "", "", ""],
        )

        body = _import(client, seeded, text, dry_run=True).json()

        assert body["header_warning"] is None

    def test_no_warning_when_the_items_match(self, client, seeded):
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )
        _import(client, seeded, text, dry_run=False)

        body = _import(client, seeded, text, dry_run=True).json()

        assert body["header_warning"] is None


class TestImportRecord:
    """每次**实际写入**留一条元信息。**不存原文。**

    原文的权威副本在 ai-course 仓库里，这里再存一份就多一份含真实姓名邮箱的
    副本要看管，而它不参与任何功能。
    """

    def test_a_real_run_records_the_import(self, client, db_session, seeded):
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        _import(client, seeded, text, dry_run=False)

        records = db_session.exec(select(HomeworkImport)).all()
        assert len(records) == 1
        assert records[0].filename == "session1/grades.csv"
        assert records[0].encoding == "utf-8"
        assert records[0].row_count == 1
        assert records[0].created_count == 1
        assert records[0].updated_count == 0
        assert records[0].course_id == seeded.id

    def test_a_dry_run_records_nothing(self, client, db_session, seeded):
        """否则「上次导入 …」会指向一次**没有发生过**的导入。"""
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        _import(client, seeded, text, dry_run=True)

        assert db_session.exec(select(HomeworkImport)).all() == []

    def test_the_page_can_read_the_latest_import(self, client, seeded):
        """作业页上的「上次导入 …」。取的是**最近一次**，所以要有确定的顺序。"""
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )
        _import(client, seeded, text, dry_run=False)
        _import(client, seeded, text, dry_run=False, filename="session1/grades-v2.csv")

        response = client.get(f"/api/homework/last-import?course={seeded.id}")

        assert response.status_code == 200
        body = response.json()
        assert body["filename"] == "session1/grades-v2.csv"
        assert body["row_count"] == 1
        assert body["imported_at"]

    def test_a_course_with_no_imports_reports_nothing(self, client, seeded):
        """还没导过的课不是错误，是"还没有"。"""
        response = client.get(f"/api/homework/last-import?course={seeded.id}")

        assert response.status_code == 200
        assert response.json() is None


class TestRejections:
    """按**内容**判定，不按扩展名。体积另设上限。"""

    def test_an_oversized_upload_is_rejected_with_the_limit_spelled_out(
        self, client, db_session, seeded
    ):
        """说"太大了"而不说上限是多少，用户不知道该压到多少才行。"""
        oversized = "a" * (MAX_UPLOAD_BYTES + 1)

        response = _import(client, seeded, oversized, dry_run=False)

        assert response.status_code == 413
        detail = response.json()["detail"]
        # 上限要以人能读的单位出现在错误里。
        assert "MB" in detail
        assert db_session.exec(select(HomeworkSubmission)).all() == []
        assert db_session.exec(select(HomeworkImport)).all() == []

    def test_an_oversized_payload_is_rejected_before_it_is_decoded(
        self, client, db_session, seeded
    ):
        """体积判断要在 base64 解码**之前**。

        先 decode 再量，等于先为一份误传的大文件分配一遍内存——而上限存在的
        理由正是别让那件事发生。判据：给一串**长度已经超标、但本身不是合法
        base64** 的内容。先解码的实现会在 base64 校验上失败（422），
        先量长度的实现直接报超限（413）——两者分得开。
        """
        # `!` 不在 base64 字母表里，所以这串东西无论如何解不开。
        too_long_and_invalid = "!" * (MAX_UPLOAD_BYTES * 2)

        response = client.post(
            "/api/homework/import?dry_run=true",
            json={
                "content_base64": too_long_and_invalid,
                "filename": "session1/grades.csv",
                "course_id": str(seeded.id),
            },
        )

        assert response.status_code == 413
        assert "MB" in response.json()["detail"]
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_a_payload_just_under_the_limit_still_gets_through(self, client, seeded):
        """上限的粗筛不能把正常文件误伤掉。

        base64 比原文长 4/3，粗筛若拿 base64 的长度直接跟字节上限比，
        一份 1.6MB 的合法文件会被当成 2MB+ 挡下来——而它明明在限内。
        """
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "", "", ""],
        )

        response = _import(client, seeded, text, dry_run=True)

        assert response.status_code == 200

    def test_a_roster_shaped_csv_is_rejected_as_the_wrong_file(
        self, client, db_session, seeded
    ):
        """最常见的成因是传错了文件，所以错误要先说这件事。

        「表头缺少必需的列：提交时间、总分」是写给命令行看的：它假设读的人
        知道"必需的列"是一份作业成绩文件才有的东西。
        """
        roster = _csv(["姓名", "邮件", "微信号"], ["学员甲", "alpha@example.com", "wx_alpha"])

        response = _import(client, seeded, roster, dry_run=True)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "不是作业成绩文件" in detail
        assert "提交时间" in detail and "总分" in detail
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_a_malformed_cell_is_a_readable_422_not_a_500(
        self, client, db_session, seeded
    ):
        """半填的 csv 是用户正常会撞到的情况，不是服务器故障。

        这条端点原本只被 CLI 调用，抛裸 ValueError 时操作者看得见 traceback；
        挂到浏览器上传后面之后，同一个异常变成 500——用户看到"服务器错了"，
        而实际是他那份文件的某一行有个 `N/A`。
        """
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "abc", "11", "7", "", "", ""],
        )

        response = _import(client, seeded, text, dry_run=True)

        assert response.status_code == 422
        detail = response.json()["detail"]
        # 说得出是哪一行、哪一列、什么值——否则用户无从下手。
        assert "session1/grades.csv:2" in detail
        assert "总分" in detail
        assert "abc" in detail
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_bytes_that_decode_as_neither_encoding_are_rejected(
        self, client, db_session, seeded
    ):
        """编码问题与表头问题的处置相反，所以措辞必须分得开：
        一个是换个格式另存，一个是确认传的是不是这份文件。"""
        raw = base64.b64encode(b"\xff\xfe\x00\x00\xff\xff\xfe\xfe").decode("ascii")

        response = client.post(
            f"/api/homework/import?dry_run=true",
            json={
                "content_base64": raw,
                "filename": "session1/grades.csv",
                "course_id": str(seeded.id),
            },
        )

        assert response.status_code == 422
        assert "UTF-8" in response.json()["detail"]
        assert db_session.exec(select(HomeworkSubmission)).all() == []

    def test_a_gb18030_upload_is_read_correctly_and_reported(
        self, client, db_session, seeded
    ):
        """Excel 另存出来的就是这种。按 UTF-8 硬读的话邮箱与分数照样对得上、
        **不报错**，而亮点、改进建议与分项列名全部乱码入库——且覆盖式写入
        会把好数据盖掉。"""
        text = _csv(
            S1_HEADER,
            ["学员甲", "alpha@example.com", "2026-06-11", "77", "11", "7", "亮点内容", "改进内容", "待回复"],
        )

        body = _import(client, seeded, text, dry_run=False, encoding="gb18030").json()

        assert body["encoding"] == "gb18030"
        written = db_session.exec(select(HomeworkSubmission)).all()
        assert written[0].highlight == "亮点内容"
        assert [s["item"] for s in written[0].scores] == ["A1工作流结构", "D2心得深度"]
