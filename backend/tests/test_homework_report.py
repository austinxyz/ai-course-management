"""批改报告上传：`POST /api/homework/submissions/{id}/report`。

预览与确认复用同一个 `dry_run` 约定（跟 `grades.csv` 导入同一个模式）——
确认时前端把上传那份内容原样重新提交，服务端不依赖预览阶段留下的临时状态。

夹具邮箱一律带 `report-` 前缀，避免撞上其他测试文件的固定邮箱。
"""

import base64
from datetime import date

import pytest
from sqlmodel import Session, select

from app.models import Course, Enrollment, HomeworkSubmission, Student

SAMPLE_REPORT = """## 学员姓名：小明
### 总分：68 / 100 分

| 维度 | 得分 | 满分 | 评语 |
|------|------|------|------|
| A1 工作流结构 | 13 | 15 | 两个 Agent 分工清晰，设计逻辑扎实。 |
| A2 数据传递 | 6 | 10 | 隐含文件传递，但未写明 OUTPUTS/ 路径。 |
| D2 心得深度 | 9 | 10 | 5 条以上具体个人观察，洞察深刻。 |

### 亮点
1. 场景选择专业，双层框架设计体现了真实业务思维。

### 改进建议
1. 补全 OUTPUTS/ 路径。

### 讲师回复草稿
小明，这份作业领域选择很有深度……
"""


def _report_b64(text: str = SAMPLE_REPORT) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def _student(session: Session, email: str, name: str = "学员") -> Student:
    row = Student(email=email, name=name, region="美东", level="有基础", source="讲武堂")
    session.add(row)
    session.commit()
    return row


def _course(session: Session, name="课程甲", short="S1") -> Course:
    course = Course(name=name, short=short)
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def _enroll(session: Session, email: str, course: Course) -> None:
    session.add(Enrollment(student_email=email, course_id=course.id, enrolled_at=date(2026, 6, 1)))
    session.commit()


def _submit(session: Session, email: str, course: Course, **over) -> HomeworkSubmission:
    row = HomeworkSubmission(
        student_email=email,
        course_id=course.id,
        submitted_at=date(2026, 6, 11),
        total=over.pop("total", 77),
        scores=over.pop(
            "scores",
            [
                {"item": "A1工作流结构", "score": 13},
                {"item": "A2数据传递", "score": 8},
                {"item": "D2心得深度", "score": 9},
            ],
        ),
        highlight=over.pop("highlight", "旧的亮点"),
        improve=over.pop("improve", "旧的改进建议"),
        source_ref="session1/grades.csv:2",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@pytest.fixture
def submission(db_session):
    course = _course(db_session)
    _student(db_session, "report-hw@example.com", "学员甲")
    _enroll(db_session, "report-hw@example.com", course)
    return _submit(db_session, "report-hw@example.com", course)


class TestPreview:
    def test_previews_without_writing(self, client, db_session, submission):
        response = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=true",
            json={"content_base64": _report_b64()},
        )

        assert response.status_code == 200
        body = response.json()
        codes = [item["code"] for item in body["items"]]
        assert codes == ["A1", "A2", "D2"]
        assert "场景选择专业" in body["highlight"]
        assert "补全 OUTPUTS/ 路径" in body["improve"]

        db_session.refresh(submission)
        assert submission.highlight == "旧的亮点"
        assert submission.dimension_comments == []
        assert submission.highlight_locked is False

    def test_does_not_expose_reply_draft(self, client, submission):
        body = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=true",
            json={"content_base64": _report_b64()},
        ).json()

        combined = body["highlight"] + body["improve"] + str(body["items"])
        assert "讲师回复草稿" not in combined

    def test_unknown_submission_is_404(self, client):
        response = client.post(
            "/api/homework/submissions/00000000-0000-0000-0000-000000000000/report?dry_run=true",
            json={"content_base64": _report_b64()},
        )

        assert response.status_code == 404

    def test_a_file_with_no_table_is_rejected(self, client, submission):
        response = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=true",
            json={"content_base64": _report_b64("这不是批改报告，只是一段文字。")},
        )

        assert response.status_code == 422


class TestConfirm:
    def test_writes_only_accepted_items(self, client, db_session, submission):
        response = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=false",
            json={"content_base64": _report_b64(), "accepted_items": ["A1", "D2"]},
        )

        assert response.status_code == 200
        db_session.refresh(submission)
        # `dimension_comments` 跟 `scores` 同一个形状：`item` 键存分项编号。
        written_codes = [c["item"] for c in submission.dimension_comments]
        assert written_codes == ["A1", "D2"]
        assert "A2" not in written_codes

    def test_overwrites_highlight_and_improve_and_locks_them(self, client, db_session, submission):
        client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=false",
            json={"content_base64": _report_b64(), "accepted_items": ["A1"]},
        )

        db_session.refresh(submission)
        assert "场景选择专业" in submission.highlight
        assert "补全 OUTPUTS/ 路径" in submission.improve
        assert submission.highlight_locked is True

    def test_empty_accepted_items_writes_no_dimension_comments(self, client, db_session, submission):
        client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=false",
            json={"content_base64": _report_b64(), "accepted_items": []},
        )

        db_session.refresh(submission)
        assert submission.dimension_comments == []
        # 亮点/改进建议不单独勾选，跟着确认动作整体生效。
        assert submission.highlight_locked is True


class TestScoreMismatch:
    def test_mismatched_dimension_is_flagged_but_not_blocked(self, client, db_session, submission):
        # 夹具里 A2 现有分数是 8，报告里是 6 —— 不一致。
        preview = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=true",
            json={"content_base64": _report_b64()},
        ).json()

        by_code = {item["code"]: item for item in preview["items"]}
        assert by_code["A2"]["mismatch"] is True
        assert by_code["A1"]["mismatch"] is False

        # 不阻止确认导入。
        confirm = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=false",
            json={"content_base64": _report_b64(), "accepted_items": ["A2"]},
        )
        assert confirm.status_code == 200

    def test_total_mismatch_is_flagged(self, client, submission):
        # 夹具总分是 77，报告总分是 68 —— 不一致。
        body = client.post(
            f"/api/homework/submissions/{submission.id}/report?dry_run=true",
            json={"content_base64": _report_b64()},
        ).json()

        assert body["total_mismatch"] is True
