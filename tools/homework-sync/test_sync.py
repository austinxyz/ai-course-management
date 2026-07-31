"""同步工具的 I/O 层：读文件、发请求、渲染报告。

三件事在这里被钉住，都是"本地跑得好好的、真跑起来才炸"的那一类：

1. dry-run **真的**不发请求，且报告里两份清单都在
2. 中文输出不因终端编码而中断
3. 后端不可达时以非零退出码结束，而不是静默当成成功
"""

import io
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent))

import sync  # noqa: E402

HEADER = "姓名,邮件,提交时间,总分,A1工作流结构,亮点,改进建议,回复状态\n"
BODY = (
    "学员甲,alpha@example.com,2026-06-11,77,11,亮点内容,改进内容,待回复\n"
    "学员乙,bravo@example.com,2026-06-12,80,12,,,\n"
)


@pytest.fixture
def grades_file(tmp_path) -> Path:
    path = tmp_path / "session1" / "grades.csv"
    path.parent.mkdir(parents=True)
    path.write_text(HEADER + BODY, encoding="utf-8")
    return path


class RecordingClient:
    """记下每次调用。测试断言"没发出去"时靠它，不靠真的网络。"""

    def __init__(self, response=None, raises=None):
        self.calls: list[tuple] = []
        self._response = response
        self._raises = raises

    def put(self, url, json=None, headers=None, timeout=None):
        self.calls.append((url, json, timeout))
        if self._raises is not None:
            raise self._raises
        return self._response


def _ok(body: dict) -> httpx.Response:
    return httpx.Response(200, json=body, request=httpx.Request("PUT", "http://x/api/homework"))


EMPTY_RESULT = {
    "created": 0,
    "updated": 0,
    "skipped_no_student": [],
    "skipped_no_enrollment": [],
}


class TestDryRun:
    def test_dry_run_sends_nothing(self, grades_file, capsysbinary):
        client = RecordingClient(response=_ok(EMPTY_RESULT))

        code = sync.main(
            ["--course", "S1", str(grades_file)],
            client=client,
            base="http://backend",
            headers={},
        )

        assert code == 0
        assert client.calls == []

    def test_dry_run_still_reports_what_it_parsed(self, grades_file, capsysbinary):
        """dry-run 走完整条解析路径。

        报不出实际执行会发生什么的 dry-run 等于没有 dry-run。
        """
        sync.main(
            ["--course", "S1", str(grades_file)],
            client=RecordingClient(response=_ok(EMPTY_RESULT)),
            base="http://backend",
            headers={},
        )

        out = capsysbinary.readouterr().out.decode("utf-8")
        assert "2 行" in out
        assert "S1" in out
        assert "dry-run" in out

    def test_apply_actually_sends(self, grades_file):
        client = RecordingClient(response=_ok({**EMPTY_RESULT, "created": 2}))

        sync.main(
            ["--course", "S1", str(grades_file), "--apply"],
            client=client,
            base="http://backend",
            headers={},
        )

        assert len(client.calls) == 1
        url, body, timeout = client.calls[0]
        assert url == "http://backend/api/homework"
        assert body["course_alias"] == "S1"
        assert [r["student_email"] for r in body["rows"]] == [
            "alpha@example.com",
            "bravo@example.com",
        ]
        # 显式超时：不设的话请求会一直挂着，而 Render 免费档冷启动几十秒。
        assert timeout is not None


class TestTwoSkipLists:
    """两份清单分开列。合并成一句「有 N 个人有问题」就无从下手：
    一类要先建学员，另一类要补报课记录，处置相反。"""

    def test_the_report_keeps_them_apart(self, grades_file, capsysbinary):
        client = RecordingClient(
            response=_ok(
                {
                    "created": 0,
                    "updated": 0,
                    "skipped_no_student": ["ghost@example.com"],
                    "skipped_no_enrollment": ["bravo@example.com"],
                }
            )
        )

        sync.main(
            ["--course", "S1", str(grades_file), "--apply"],
            client=client,
            base="http://backend",
            headers={},
        )

        out = capsysbinary.readouterr().out.decode("utf-8")
        first = out.index("ghost@example.com")
        second = out.index("bravo@example.com")
        # 两个邮箱之间必须隔着第二份清单的标题，否则就是一份清单
        between = out[min(first, second) : max(first, second)]
        assert "补报课" in between or "报课记录" in between
        assert "先建学员" in out or "不在学员表" in out


class TestEncoding:
    """Windows 控制台默认 cp1252，而这个脚本的输出整个是中文。

    直接 print 会在第一行就抛 UnicodeEncodeError，把一次**只读**的 dry-run
    变成崩溃——而崩溃的样子跟"数据有问题"很像，最容易被误判。

    pytest 捕获的是内存流，所以本地测试全绿也照样在真终端里炸。
    这条用一个只认 cp1252 的假 stdout 把它钉住。
    """

    def test_report_survives_a_single_byte_console(self, grades_file, monkeypatch):
        raw = io.BytesIO()
        monkeypatch.setattr(
            sync.sys, "stdout", io.TextIOWrapper(raw, encoding="cp1252", errors="strict")
        )

        code = sync.main(
            ["--course", "S1", str(grades_file)],
            client=RecordingClient(response=_ok(EMPTY_RESULT)),
            base="http://backend",
            headers={},
        )

        assert code == 0
        assert "S1" in raw.getvalue().decode("utf-8")


class TestFailurePaths:
    def test_timeout_exits_non_zero_with_a_readable_message(self, grades_file, capsysbinary):
        client = RecordingClient(raises=httpx.TimeoutException("timed out"))

        code = sync.main(
            ["--course", "S1", str(grades_file), "--apply"],
            client=client,
            base="http://backend",
            headers={},
        )

        assert code != 0
        out = capsysbinary.readouterr().out.decode("utf-8")
        assert "超时" in out

    def test_an_error_response_exits_non_zero(self, grades_file, capsysbinary):
        """httpx 不会因 4xx/404 抛异常。不显式检查的话，脚本会"成功地什么都没做"。"""
        client = RecordingClient(
            response=httpx.Response(
                404,
                json={"detail": "没有别名为 'S9' 的课程"},
                request=httpx.Request("PUT", "http://x/api/homework"),
            )
        )

        code = sync.main(
            ["--course", "S9", str(grades_file), "--apply"],
            client=client,
            base="http://backend",
            headers={},
        )

        assert code != 0
        assert "S9" in capsysbinary.readouterr().out.decode("utf-8")

    def test_a_missing_file_exits_non_zero(self, tmp_path, capsysbinary):
        code = sync.main(
            ["--course", "S1", str(tmp_path / "nope.csv")],
            client=RecordingClient(response=_ok(EMPTY_RESULT)),
            base="http://backend",
            headers={},
        )

        assert code != 0

    def test_course_is_required(self, grades_file):
        """课程不能从路径推断——源仓库的目录名已经错了一处。"""
        with pytest.raises(SystemExit):
            sync.main(
                [str(grades_file)],
                client=RecordingClient(response=_ok(EMPTY_RESULT)),
                base="http://backend",
                headers={},
            )
