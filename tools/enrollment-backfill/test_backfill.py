"""写入路径的测试。用假的 HTTP 客户端，不打真库、不发真请求。"""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from backfill import Outcome, push  # noqa: E402
from planning import PlannedEnrollment  # noqa: E402


class FakeClient:
    """记录收到的请求，按预设依次返回状态码。"""

    def __init__(self, statuses: list[int]):
        self.statuses = list(statuses)
        self.sent: list[dict] = []

    def post(self, url, json, **kw):  # noqa: A002 - 对齐 httpx 的签名
        self.sent.append(json)
        code = self.statuses.pop(0)

        class Resp:
            status_code = code

            @staticmethod
            def json():
                return {"detail": "这条报课已经存在"}

        return Resp()


def row(email: str) -> PlannedEnrollment:
    return PlannedEnrollment(
        student_email=email,
        course_id="c-1",
        course_name="从零开始",
        enrolled_at=date(2026, 6, 7),
    )


def test_sends_every_field_the_record_carries():
    client = FakeClient([201])

    push(client, "http://backend", {}, [row("alpha@example.com")])

    assert client.sent == [
        {
            "student_email": "alpha@example.com",
            "course_id": "c-1",
            "session_id": None,
            "enrolled_at": "2026-06-07",
            "source": "derived",
            "note": "",
        }
    ]


def test_a_conflict_counts_as_already_there_rather_than_failing():
    """重跑时每一条都会撞唯一约束。那是**预期**，不是错误——
    脚本要能跑第二遍并报告"新建 0、已存在 N"，而不是中途退出。
    """
    client = FakeClient([409, 201])

    result = push(client, "http://backend", {}, [row("a@example.com"), row("b@example.com")])

    assert result == Outcome(created=1, already_there=1, failed=[])


def test_other_errors_are_collected_not_swallowed():
    """409 之外的失败要留下来。全部当成"已存在"会让一次半途而废的导入
    看起来和一次成功的重跑一模一样。
    """
    client = FakeClient([500])

    result = push(client, "http://backend", {}, [row("a@example.com")])

    assert result.created == 0
    assert result.already_there == 0
    assert len(result.failed) == 1
    assert "a@example.com" in result.failed[0]
