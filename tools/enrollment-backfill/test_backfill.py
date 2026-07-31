"""写入路径的测试。用假的 HTTP 客户端，不打真库、不发真请求。"""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from backfill import Outcome, Plan, push  # noqa: E402
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


class DetailClient(FakeClient):
    """409 时带上后端给的 detail 原文。"""

    def __init__(self, pairs: list[tuple[int, str]]):
        super().__init__([c for c, _ in pairs])
        self.details = [d for _, d in pairs]

    def post(self, url, json, **kw):  # noqa: A002
        detail = self.details.pop(0)
        resp = super().post(url, json, **kw)

        class Resp:
            status_code = resp.status_code

            @staticmethod
            def json():
                return {"detail": detail}

        return Resp()


def test_an_offline_course_is_not_miscounted_as_already_there():
    """后端对"已经存在"和"这门课已下线"都返回 409。

    一律当成"已存在"会让"22 条全都因为课下线而没写进去"看起来和
    "重跑，22 条本来就在"一模一样——而这两件事一个要处理、一个不用。
    """
    client = DetailClient([(409, "这门课已下线，不能新建报课")])

    result = push(client, "http://backend", {}, [row("a@example.com")])

    assert result.already_there == 0
    assert len(result.failed) == 1
    assert "已下线" in result.failed[0]


def test_output_survives_a_non_utf8_console(capsys, monkeypatch):
    """Windows 控制台默认 cp1252，而这个脚本的输出整个是中文。

    不显式设编码的话，`describe` 第一行就抛 UnicodeEncodeError ——
    一次只读的 dry-run 变成崩溃，而崩在哪里跟"数据有问题"看起来很像。
    """
    import io

    import backfill

    # 模拟一个只认 cp1252 的 stdout
    raw = io.BytesIO()
    monkeypatch.setattr(
        backfill.sys, "stdout", io.TextIOWrapper(raw, encoding="cp1252", errors="strict")
    )

    backfill.describe(
        backfill.Plan(
            to_create=[
                PlannedEnrollment(
                    student_email="a@example.com",
                    course_id="c-1",
                    course_name="从零开始",
                    enrolled_at=date(2026, 6, 7),
                )
            ],
            missing_students=["stranger@example.com"],
            skipped_dirs=[("session4", "文件里没有任何提交记录")],
        )
    )

    backfill.sys.stdout.flush()
    assert "从零开始" in raw.getvalue().decode("utf-8")


# --- 建档缺失的学员（显式开关） -------------------------------------------


def test_creating_missing_students_requires_the_three_values_to_be_given():
    """`region` / `level` / `source` 都是必填枚举，而 CSV 里只有姓名与邮箱。

    三个值**必须由调用方给出**，函数不设默认 —— 有默认就等于"编一个"，
    而编出来的"小白"在界面上看着和真的一模一样。
    """
    import inspect

    import backfill

    sig = inspect.signature(backfill.create_students)
    for name in ("region", "level", "source"):
        assert sig.parameters[name].default is inspect.Parameter.empty, name


def test_creates_one_student_per_missing_email():
    import backfill

    client = FakeClient([201, 201])

    made = backfill.create_students(
        client,
        "http://backend",
        {},
        [("a@example.com", "学员甲"), ("b@example.com", "学员乙")],
        region="美东",
        level="有基础",
        source="讲武堂",
    )

    assert made == 2
    assert [c["email"] for c in client.sent] == ["a@example.com", "b@example.com"]
    assert client.sent[0]["region"] == "美东"
    assert client.sent[0]["level"] == "有基础"
    assert client.sent[0]["source"] == "讲武堂"
    assert client.sent[0]["name"] == "学员甲"


def test_an_already_existing_student_is_not_counted_as_created():
    """重跑时这些人已经在库里了，409 是预期而不是错误。"""
    import backfill

    client = FakeClient([409])

    made = backfill.create_students(
        client, "http://backend", {}, [("a@example.com", "学员甲")],
        region="美东", level="有基础", source="讲武堂",
    )

    assert made == 0
