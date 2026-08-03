"""批改报告（`{姓名}_{日期}_report.md`）的解析：文本 → 逐分项评语 + 整体评语。

全部纯函数——不读文件、不碰数据库。分类与写入在
`app/routers/homework.py` 的上传端点里。跟 `homework_parsing.py` 分开的理由
一样：表格格式、段落切分最容易悄悄出错，而错了从预览屏上不一定看得出来。

**只解析表格 + 亮点 + 改进建议**。报告里还有「讲师回复草稿」与「作业原文」
两段，本变更故意不碰——那两段要么是另一条能力的事（回复），要么就是
学员自己的提交内容，跟"讲师批改结论"不是一回事。
"""

import re
from dataclasses import dataclass, field


class BadReport(Exception):
    """整份文本里一行分项表格都解析不出来。中止，不猜。"""

    def __init__(self) -> None:
        super().__init__(
            "这看起来不是批改报告：没有找到分项评分表格。"
            "请确认上传的是批改流程生成的 report.md。"
        )


class MalformedReportCell(Exception):
    """某个分项的得分/满分读不成数字。**说得出是哪个分项、哪一列、什么值。**"""

    def __init__(self, code: str, column: str, value: str) -> None:
        self.code = code
        self.column = column
        self.value = value
        super().__init__(f"分项 {code} 的「{column}」列读不出数值：{value!r}。")


_CODE_RE = re.compile(r"^([A-Za-z]\d+)")
_SEPARATOR_RE = re.compile(r"^\|[\s\-:|]+\|$")
_TOTAL_RE = re.compile(r"总分[：:]\s*(\d+)")


@dataclass(frozen=True)
class ReportParseResult:
    # 每项：{code, score, max, comment}。
    items: list[dict] = field(default_factory=list)
    highlight: str = ""
    improve: str = ""
    # 「### 总分：68 / 100 分」那一行解析出的数字；没找到该行就是 None
    # （比对总分是否一致时，None 表示"这份报告里没写总分"，不当成 0 处理）。
    total: int | None = None


def _parse_table(lines: list[str]) -> list[dict]:
    """在整份文本的行列表里找表头含「维度」的表格，解析出其后的数据行。"""
    header_index = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("|") and "维度" in stripped:
            header_index = i
            break
    if header_index is None:
        return []

    items: list[dict] = []
    # 表头下一行通常是分隔行（|---|---|），跳过；数据行从那之后开始，
    # 遇到第一行不是以 `|` 开头就停（表格结束）。
    start = header_index + 1
    if start < len(lines) and _SEPARATOR_RE.match(lines[start].strip()):
        start += 1

    for line in lines[start:]:
        stripped = line.strip()
        if not stripped.startswith("|"):
            break
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 4:
            continue
        match = _CODE_RE.match(cells[0])
        if not match:
            continue
        code = match.group(1)
        score = _to_int(cells[1], code=code, column="得分")
        max_score = _to_int(cells[2], code=code, column="满分")
        items.append({"code": code, "score": score, "max": max_score, "comment": cells[3]})

    return items


def _to_int(cell: str, *, code: str, column: str) -> int:
    text = cell.strip()
    try:
        return int(float(text))
    except ValueError:
        raise MalformedReportCell(code, column, text) from None


def _section(lines: list[str], heading: str) -> str:
    """`### {heading}` 到下一个 `###` 标题（或文末）之间的原文，去首尾空行。"""
    start = None
    for i, line in enumerate(lines):
        if line.strip() == f"### {heading}":
            start = i + 1
            break
    if start is None:
        return ""

    end = len(lines)
    for i in range(start, len(lines)):
        if lines[i].strip().startswith("###"):
            end = i
            break

    return "\n".join(lines[start:end]).strip()


def _total(text: str) -> int | None:
    match = _TOTAL_RE.search(text)
    return int(match.group(1)) if match else None


def parse_report(text: str) -> ReportParseResult:
    """解析一份批改报告。表格一行都解析不出时拒绝整份文件。"""
    lines = text.splitlines()
    items = _parse_table(lines)
    if not items:
        raise BadReport()

    return ReportParseResult(
        items=items,
        highlight=_section(lines, "亮点"),
        improve=_section(lines, "改进建议"),
        total=_total(text),
    )
