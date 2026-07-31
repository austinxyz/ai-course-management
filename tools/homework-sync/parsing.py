"""`grades.csv` 的解析：文本 → 可以直接发给接口的行。

全部纯函数——不读文件、不发网络。文件与 HTTP 在 `sync.py` 里。
分开是因为这一层管的两件事（哪些列算分项、同一人两行谁赢）最容易悄悄出错，
而错了之后从页面上看不出来：分项乱序只是分组变了，取错行只是分数变了。

**不从路径推断课程。** 源仓库的目录名已经错了一处：`session3/` 与 `session4/`
的 `references/rubric.md` 是对调的，`session4/` 整个目录是 S3 的空壳。
课程由调用方在命令行显式指定。
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime


class BadHeader(Exception):
    """表头缺了必需的列。中止，不猜。"""


# 固定列：每门课都一样的那几列。**分项列由排除法得出**——不在这个集合里的
# 就是分项，按表头出现顺序。
#
# 反过来（维护一张分项名单）行不通：各课的分项列零交集（S1 是 A1–D2，
# S2 是 E1–G2，无一相同），而新增一门课不得要求改代码。
FIXED_COLUMNS = frozenset({"姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"})

# 少了这几列就没法构造一条记录。「邮件」尤其关键：它是关联到人的唯一途径，
# 姓名不行（会变，且重名）。
REQUIRED_COLUMNS = ("邮件", "提交时间", "总分")


def split_header(header: list[str]) -> list[str]:
    """表头 → 分项列名，按出现顺序。

    顺序不是美观问题：它是评分表分组结构（A 工作流 / B 提示词 / C 输出 / D 心得）
    的唯一载体，源文件里没有别的地方记着这件事。
    """
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise BadHeader(f"表头缺少必需的列：{'、'.join(missing)}")
    return [c for c in header if c not in FIXED_COLUMNS]


@dataclass(frozen=True)
class ParseResult:
    """一份 csv 解析出来的全部东西。

    被丢弃的行不是"没有"，而是各自成一份清单——18 行 / 17 人这个差额
    如果无声无息，就没人会去查它是怎么来的。
    """

    rows: list[dict]
    # 邮箱为空的行（`文件:行号`）。没有邮箱就关联不到人。
    rows_without_email: list[str] = field(default_factory=list)
    # 被同一人更晚的一次提交顶掉的行（`文件:行号`）。
    superseded: list[str] = field(default_factory=list)
    # 邮箱 → 姓名。**只用于报告可读**，关联一律走邮箱。
    names: dict[str, str] = field(default_factory=dict)


def _score(cell: str) -> int:
    """空格子记 0，不是把这一列去掉。

    去掉的话同一门课不同学员会得到长度不同的分项列表，页面上读起来像
    "这个人少考了一项"。加分项本来就有人没做。
    """
    text = (cell or "").strip()
    if not text:
        return 0
    return int(float(text))


def _submitted_at(cell: str) -> date:
    return datetime.strptime((cell or "").strip(), "%Y-%m-%d").date()


def parse(text: str, *, source: str) -> ParseResult:
    """解析一份 `grades.csv`。

    `source` 是报告与 `source_ref` 里用的文件名（如 `session1/grades.csv`），
    **不参与**课程判断。
    """
    reader = csv.reader(io.StringIO(text))
    try:
        header = [c.strip() for c in next(reader)]
    except StopIteration:
        return ParseResult(rows=[])

    items = split_header(header)
    index = {name: i for i, name in enumerate(header)}

    def cell(row: list[str], name: str) -> str:
        position = index.get(name)
        if position is None or position >= len(row):
            return ""
        return row[position]

    # 邮箱 → 已选中的那一行。同一人第二次出现时按规则决定谁留下。
    chosen: dict[str, dict] = {}
    order: list[str] = []
    no_email: list[str] = []
    superseded: list[str] = []
    names: dict[str, str] = {}

    for offset, raw in enumerate(reader):
        line_no = offset + 2  # 表头是第 1 行
        ref = f"{source}:{line_no}"
        if not any((c or "").strip() for c in raw):
            continue

        email = cell(raw, "邮件").strip().lower()
        if not email:
            no_email.append(ref)
            continue

        name = cell(raw, "姓名").strip()
        if name:
            names[email] = name

        row = {
            "student_email": email,
            "submitted_at": _submitted_at(cell(raw, "提交时间")),
            # 原样取「总分」列，**不做** sum(scores)。session2 里真有一行对不上，
            # 而镜像的职责是忠实，不是纠正。
            "total": _score(cell(raw, "总分")),
            "scores": [{"item": name_, "score": _score(cell(raw, name_))} for name_ in items],
            "highlight": cell(raw, "亮点").strip(),
            "improve": cell(raw, "改进建议").strip(),
            # 原样带走，不归一化。实测取值是「待回复」「草稿已创建」。
            "reply_status": cell(raw, "回复状态").strip(),
            "source_ref": ref,
        }

        previous = chosen.get(email)
        if previous is None:
            chosen[email] = row
            order.append(email)
            continue

        # 取提交时间较晚的那一行；并列时取文件里靠后的那一行。
        # `>=` 而不是 `>` 正是"并列取后者"这条规则。
        if row["submitted_at"] >= previous["submitted_at"]:
            superseded.append(previous["source_ref"])
            chosen[email] = row
        else:
            superseded.append(ref)

    return ParseResult(
        rows=[chosen[email] for email in order],
        rows_without_email=no_email,
        superseded=superseded,
        names=names,
    )
