"""`grades.csv` 的解析：字节 → 文本 → 可以直接落库的行。

全部纯函数——不读文件、不发网络、不碰数据库。分类与写入在
`app/routers/homework.py` 的导入端点里。分开是因为这一层管的三件事
（按什么编码读、哪些列算分项、同一人两行谁赢）最容易悄悄出错，
而错了之后从页面上看不出来：编码错了只是中文变成另一批中文字，
分项乱序只是分组变了，取错行只是分数变了。

以下几条教训原本写在 `tools/homework-sync/README.md` 里。那个工具已随
`homework-upload` 删除（解析挪进来之后它只剩「读文件 + 发上去」，
而那件事网页已经能做），教训跟着搬到这里，不随目录一起消失。

**不从路径推断课程。** 源仓库的目录名已经错了一处：

| 文件 | 内容 | 实际属于 |
|---|---|---|
| `session3/grades.csv` + `submissions/` | 建站 · 海报 · PPT | S3 ✅ |
| `session3/references/rubric.md` | `/market-daily` Skill | **S4** ❌ |
| `session4/references/rubric.md` | Claude Design 建站 | **S3** ❌ |
| `session4/grades.csv` | 0 行，S3 的表头 | S3 的空壳 |

路径看起来是可靠线索，实际不是。课程由调用方显式指定，查不到就整份拒绝——
别名错了意味着整份文件都可能挂错课。

**总分原样存**，不由分项求和。`session2/grades.csv` 里真有一行对不上，
而镜像的职责是忠实，不是纠正。

**同一人两行取提交时间较晚的那一行**；日期并列时取文件里靠后的那一行。
被丢掉的行在 `ParseResult.superseded` 里列出来——18 行 / 17 人这个差额
如果无声无息，就没人会去查它是怎么来的。
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime


class BadHeader(Exception):
    """表头缺了必需的列。中止，不猜。

    携带 `missing` 是为了让上层能自己渲染，而不是对着消息字符串做子串匹配。
    """

    def __init__(self, missing: list[str]) -> None:
        self.missing = list(missing)
        super().__init__(
            "这看起来不是作业成绩文件：缺少" + "、".join(f"「{c}」" for c in self.missing) + "这几列。"
            "请确认上传的是批改流程生成的 grades.csv。"
        )


class MalformedCell(Exception):
    """某一格读不成数字或日期。**说得出是哪一行、哪一列、什么值。**

    与 `BadHeader` / `CannotDecode` 三者分开，因为处置各不相同：
    换个编码另存 / 确认传的是不是这份文件 / 回源文件改那一行。

    这一层原本只被 CLI 调用，抛裸 `ValueError` 是够用的——操作者看得见
    traceback。挂到浏览器上传与 MCP 后面之后，裸 `ValueError` 会一路冒到
    端点外变成 500，用户看到的是"服务器错了"，而实际是他那份 csv 的
    第 7 行有个 `N/A`。
    """

    def __init__(self, ref: str, column: str, value: str) -> None:
        self.ref = ref
        self.column = column
        self.value = value
        super().__init__(
            f"{ref} 的「{column}」列读不出数值：{value!r}。"
            "请回源文件核对这一行——分数要是数字，提交时间要是 2026-06-11 这样的日期。"
        )


class CannotDecode(Exception):
    """UTF-8 与 GB18030 都解不开这份字节。

    与 `BadHeader` 分开是因为处置相反：编码问题让用户换个格式另存，
    表头问题让用户确认是不是传错了文件。合成一种异常，上层就没法分别措辞。
    """


# 顺序不能反。GB18030 的单字节部分兼容 ASCII、双字节部分覆盖面极广，
# 几乎能解开任何字节序列——先试它的话，一份 UTF-8 中文会被静默解成
# **另一批中文字**，不抛异常，而"内容对不对"只有人眼分得出。
#
# `utf-8-sig` 而不是 `utf-8`：Excel 存的 UTF-8 带 BOM，不剥掉的话第一个
# 列名会变成 `﻿姓名`，于是「姓名」这一列认不出来——而报出来的错会说
# "表头缺少必需的列"，指向一个完全不相干的方向。
#
# 对外报出的名字是 `utf-8`：BOM 在不在是文件的细节，不是用户要核对的事。
_CODECS = (("utf-8-sig", "utf-8"), ("gb18030", "gb18030"))


def decode_csv(raw: bytes) -> tuple[str, str]:
    """上传的字节 → `(文本, 实际采用的编码)`。

    拿到的必须是**原始字节**。在 Next 一侧用 `file.text()` 读成字符串的话，
    浏览器已经按 UTF-8 解过一遍，GBK 文件到这里已经是替换字符，
    再想试 GB18030 已经没有字节可试了。
    """
    for codec, label in _CODECS:
        try:
            return raw.decode(codec), label
        except UnicodeDecodeError:
            continue
    raise CannotDecode(
        "这份文件既不是 UTF-8 也不是 GB18030，无法读取。"
        "请在 Excel 里用「CSV UTF-8（逗号分隔）」重新另存后再上传。"
    )


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
        raise BadHeader(missing)
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


def _score(cell: str, *, ref: str, column: str) -> int:
    """空格子记 0，不是把这一列去掉。

    去掉的话同一门课不同学员会得到长度不同的分项列表，页面上读起来像
    "这个人少考了一项"。加分项本来就有人没做。

    但**读不出数的非空格子不是 0**：把 `abc` 记成 0 会静默给人判零分，
    而零分是一个真实的分数（S1 里就有人 A3 得 0），两者混在一起就再也
    分不出"他没做"和"这一格坏了"。
    """
    text = (cell or "").strip()
    if not text:
        return 0
    try:
        return int(float(text))
    except ValueError:
        raise MalformedCell(ref, column, text) from None


def _submitted_at(cell: str, *, ref: str) -> date:
    text = (cell or "").strip()
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        raise MalformedCell(ref, "提交时间", text) from None


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
            "submitted_at": _submitted_at(cell(raw, "提交时间"), ref=ref),
            # 原样取「总分」列，**不做** sum(scores)。session2 里真有一行对不上，
            # 而镜像的职责是忠实，不是纠正。
            "total": _score(cell(raw, "总分"), ref=ref, column="总分"),
            "scores": [
                {"item": name_, "score": _score(cell(raw, name_), ref=ref, column=name_)}
                for name_ in items
            ],
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
