"""解析层：`grades.csv` 的文本 → 可以直接发给接口的行。

全部纯函数，不碰文件也不碰网络。这样"哪一行赢""哪些列算分项"这两件最容易
悄悄出错、又最难事后发现的事可以被单独钉住。

夹具一律用虚构姓名与 @example.com —— 真实学员数据不进仓库。
"""

from datetime import date

import pytest

from app.homework_parsing import (
    FIXED_COLUMNS,
    BadHeader,
    CannotDecode,
    MalformedCell,
    decode_csv,
    parse,
    split_header,
)

# S1 的形状：分项列夹在「总分」与「亮点」之间。
S1_HEADER = [
    "姓名",
    "邮件",
    "提交时间",
    "总分",
    "A1工作流结构",
    "A2数据传递",
    "A3Cowork特性",
    "B1提示词三要素",
    "B2输出路径",
    "B3可复现性",
    "C1输出真实性",
    "C2输出匹配度",
    "D1心得字数",
    "D2心得深度",
    "亮点",
    "改进建议",
    "回复状态",
]

# S2 的形状：列数与列名与 S1 毫无交集。
S2_HEADER = [
    "姓名",
    "邮件",
    "提交时间",
    "总分",
    "E1领域与结构",
    "E2Wiki数量",
    "E3Wiki结构",
    "E4Wiki质量",
    "E5专业洞察",
    "F1PPT提交",
    "F2PPT质量",
    "G1心得字数",
    "G2心得深度",
    "亮点",
    "改进建议",
    "回复状态",
]


def _csv(header: list[str], *rows: list[str]) -> str:
    lines = [",".join(header)]
    lines.extend(",".join(r) for r in rows)
    return "\n".join(lines) + "\n"


class TestDecodeCsv:
    """上传上来的是**字节**，先判编码再谈解析。

    判据不能只是"内容对"：GB18030 能把 UTF-8 中文解成**另一批中文字**，
    人眼分得出、断言分不出。所以每个用例都钉住 `encoding` 这个返回值本身。
    """

    def test_gb18030_bytes_are_decoded_and_reported(self):
        """Excel 另存出来的就是这种字节。

        夹具先自证：这串字节按 UTF-8 **解不开**——这正是回退到 GB18030
        的必要条件。少了这一句，测试就退化成一次 encode/decode 往返，
        任何实现都能过。
        """
        raw = "姓名,邮件\n学员甲,alpha@example.com\n".encode("gb18030")
        with pytest.raises(UnicodeDecodeError):
            raw.decode("utf-8")

        text, encoding = decode_csv(raw)

        assert encoding == "gb18030"
        assert text.startswith("姓名,邮件")
        assert "学员甲" in text

    def test_utf8_bytes_are_reported_as_utf8(self):
        """断言的重点是 `encoding` 这个值，不是内容。

        夹具先自证：这串 UTF-8 字节按 GB18030 **也解得开**，解出来是
        `瀛﹀憳鐢蹭箼` 这样一批别的中文字，不抛异常。所以"内容对不对"
        在测试里根本区分不了顺序反没反，能区分的只有这个返回值。

        姓名用四个字不是随意的：UTF-8 的中日韩字符一个占 3 字节，
        **三个字**（9 字节，奇数）会让 GB18030 在最后一个字节上撞到
        非法双字节序列而解不开——于是即便顺序反了也会退回 UTF-8，
        测试照样绿。这个夹具因此必须凑成偶数个汉字，
        否则它就是一条永远不会红的假测试（1.7 的变异验证抓到过一次）。
        """
        raw = "姓名,邮件\n学员甲乙,alpha@example.com\n".encode("utf-8")
        assert raw.decode("gb18030") != "姓名,邮件\n学员甲乙,alpha@example.com\n"

        text, encoding = decode_csv(raw)

        assert encoding == "utf-8"
        assert text.startswith("姓名,邮件")
        assert "学员甲乙" in text

    def test_utf8_with_bom_loses_the_bom(self):
        """Excel 存的 UTF-8 带 BOM。

        不剥掉的话第一个列名是 `﻿姓名`，「姓名」这一列就认不出来，
        而抛出来的错会说"表头缺少必需的列"——指向一个完全不相干的方向。
        用 `utf-8-sig` 的全部理由就是这一句。
        """
        raw = "﻿姓名,邮件\n学员甲,alpha@example.com\n".encode("utf-8")

        text, encoding = decode_csv(raw)

        assert encoding == "utf-8"
        assert text.split(",")[0] == "姓名"
        assert not text.startswith("﻿")

    def test_bytes_that_decode_as_neither_are_rejected(self):
        """两种编码都解不开就拒绝，且异常要与「表头不对」**可区分**。

        两者的处置完全不同：编码问题让用户换个格式另存，表头问题让用户
        确认是不是传错了文件。混成一种异常，上层就没法分别措辞。
        """
        raw = b"\xff\xfe\x00\x00\xff\xff\xfe\xfe"

        with pytest.raises(CannotDecode):
            decode_csv(raw)

        assert not issubclass(CannotDecode, BadHeader)
        assert not issubclass(BadHeader, CannotDecode)


class TestMalformedCells:
    """格式错的单元格要抛**可分辨**的异常，且说得出是哪一行哪一列。

    这一层原本只被 CLI 调用：抛裸 `ValueError` 时操作者看得见 traceback，
    知道是自己那份文件的问题。现在同一层挂在浏览器上传与 MCP 后面，
    裸 `ValueError` 会一路冒到端点外变成 500——用户看到的是"服务器错了"，
    而实际是他那份 csv 的第 7 行有个 `N/A`。
    """

    def test_a_non_numeric_score_names_the_row_and_the_value(self):
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-20", "abc", "", "", ""],
        )

        with pytest.raises(MalformedCell) as caught:
            parse(text, source="session1/grades.csv")

        assert caught.value.ref == "session1/grades.csv:2"
        assert caught.value.column == "总分"
        assert caught.value.value == "abc"
        # 消息要能直接展示给上传的人看：他要回源文件去改那一行。
        assert "session1/grades.csv:2" in str(caught.value)
        assert "总分" in str(caught.value)

    def test_an_unparseable_date_is_the_same_kind_of_error(self):
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "N/A", "70", "", "", ""],
        )

        with pytest.raises(MalformedCell) as caught:
            parse(text, source="s.csv")

        assert caught.value.column == "提交时间"
        assert caught.value.value == "N/A"

    def test_a_bad_item_score_names_that_item_column(self):
        """分项列的列名各课不同，所以报的必须是**实际那一列**的名字，
        不能笼统说"某个分数列"——用户要拿着它去源文件里定位。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "A1工作流结构", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-20", "70", "满分", "", "", ""],
        )

        with pytest.raises(MalformedCell) as caught:
            parse(text, source="s.csv")

        assert caught.value.column == "A1工作流结构"
        assert caught.value.value == "满分"

    def test_it_is_distinguishable_from_the_other_two_rejections(self):
        """三类拒绝的处置各不相同：换编码另存 / 确认传的是不是这份文件 /
        回源文件改某一行。合成一种异常，上层就没法分别措辞。"""
        assert not issubclass(MalformedCell, BadHeader)
        assert not issubclass(MalformedCell, CannotDecode)


class TestSplitHeader:
    """哪些列是分项，由**排除法**决定：不在固定列白名单里的就是分项。

    反过来（列一张分项名单）是行不通的：各课的分项列零交集，且新增课程
    不得要求改代码。断言里因此不出现任何硬编码的分项名清单。
    """

    def test_s1_shape(self):
        items = split_header(S1_HEADER)

        assert items == [c for c in S1_HEADER if c not in FIXED_COLUMNS]
        # 顺序就是表头顺序——它是 A/B/C/D 分组的唯一载体
        assert items[0] == "A1工作流结构"
        assert items[-1] == "D2心得深度"

    def test_s2_shape_needs_no_code_change(self):
        items = split_header(S2_HEADER)

        assert items == [c for c in S2_HEADER if c not in FIXED_COLUMNS]
        assert len(items) == 9

    def test_a_header_with_no_score_columns_is_fine(self):
        """只有固定列的课程也合法——那只是还没定评分表。"""
        assert split_header(["姓名", "邮件", "提交时间", "总分"]) == []

    def test_missing_a_required_column_is_rejected(self):
        """少了「邮件」就没法关联到人。中止，不猜。"""
        with pytest.raises(BadHeader):
            split_header(["姓名", "提交时间", "总分"])

    def test_the_error_lets_the_user_tell_they_uploaded_the_wrong_file(self):
        """最常见的成因是传错了文件，所以错误要先说这件事。

        「表头缺少必需的列：提交时间、总分」是写给命令行看的：它假设读的人
        知道"必需的列"是一份作业成绩文件才有的东西。网页上传的人手里
        可能是一份学员名单，他需要的判断依据是"这看起来不是作业成绩文件"，
        而不是一条内部校验细节。两样都要有——只说前者他不知道该换成什么。
        """
        roster_shaped = ["姓名", "邮件", "微信号"]

        with pytest.raises(BadHeader) as caught:
            split_header(roster_shaped)

        message = str(caught.value)
        assert "不是作业成绩文件" in message
        assert "提交时间" in message and "总分" in message
        # 缺了哪几列要能被上层拿去渲染，而不是只能对着字符串做子串匹配
        assert caught.value.missing == ["提交时间", "总分"]


class TestParse:
    def test_scores_keep_header_order(self):
        text = _csv(
            S1_HEADER,
            [
                "学员甲",
                "alpha@example.com",
                "2026-06-11",
                "77",
                "11", "9", "0", "13", "9", "3", "7", "8", "10", "7",
                "亮点内容", "改进内容", "待回复",
            ],
        )

        rows = parse(text, source="session1/grades.csv").rows

        assert [s["item"] for s in rows[0]["scores"]] == split_header(S1_HEADER)
        assert [s["score"] for s in rows[0]["scores"]] == [11, 9, 0, 13, 9, 3, 7, 8, 10, 7]

    def test_total_is_carried_over_not_recomputed(self):
        """总分取「总分」列，不由分项求和。

        session2/grades.csv 里真有一行对不上。镜像的职责是忠实，不是纠正——
        这里用一行故意对不上的数据钉住这一点。
        """
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "E1领域与结构", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-20", "73", "40", "", "", ""],
        )

        assert parse(text, source="s.csv").rows[0]["total"] == 73

    def test_blank_score_cell_counts_as_zero(self):
        """空格子记 0，而不是把这一列从分项里去掉。

        去掉的话同一门课不同学员会得到长度不同的分项列表，页面上就成了
        "这个人少考了一项"。session4 的加分项本来就有人没做。
        """
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "K1网站上线", "加分DemoBC", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-07-29", "22", "22", "", "", "", ""],
        )

        scores = parse(text, source="s.csv").rows[0]["scores"]

        assert [s["item"] for s in scores] == ["K1网站上线", "加分DemoBC"]
        assert [s["score"] for s in scores] == [22, 0]

    def test_reply_status_is_carried_verbatim(self):
        """回复状态原样带走，不归一化。实测取值是「待回复」「草稿已创建」。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-20", "73", "", "", "草稿已创建"],
        )

        assert parse(text, source="s.csv").rows[0]["reply_status"] == "草稿已创建"

    def test_email_is_normalized_to_lowercase(self):
        """邮箱是主键，大小写不同不是两个人。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", " Alpha@Example.com ", "2026-06-20", "73", "", "", ""],
        )

        assert parse(text, source="s.csv").rows[0]["student_email"] == "alpha@example.com"

    def test_source_ref_points_back_at_the_file_and_line(self):
        """出了问题要能回到源头去核。行号按 csv 的物理行算（表头是第 1 行）。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-20", "73", "", "", ""],
            ["学员乙", "bravo@example.com", "2026-06-21", "80", "", "", ""],
        )

        rows = parse(text, source="session2/grades.csv").rows

        assert rows[0]["source_ref"] == "session2/grades.csv:2"
        assert rows[1]["source_ref"] == "session2/grades.csv:3"

    def test_a_row_with_no_email_is_reported_not_silently_dropped(self):
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "", "2026-06-20", "73", "", "", ""],
        )

        result = parse(text, source="s.csv")

        assert result.rows == []
        assert result.rows_without_email == ["s.csv:2"]

    def test_a_completely_empty_file_body_yields_nothing(self):
        """session4/grades.csv 就是这样：只有表头，0 行。"""
        result = parse(_csv(S1_HEADER), source="session4/grades.csv")

        assert result.rows == []
        assert result.rows_without_email == []


class TestDeduplication:
    """同一人同一课交了两次时，哪一行赢。

    消歧放在解析层：交给接口的 upsert 去决定，等于让"哪一行最后写入"这件事
    取决于遍历顺序——一个不写在任何地方的隐式依赖。
    """

    def test_the_later_submission_wins(self):
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-11", "60", "", "", ""],
            ["学员甲", "alpha@example.com", "2026-06-18", "88", "", "", ""],
        )

        rows = parse(text, source="s.csv").rows

        assert len(rows) == 1
        assert rows[0]["total"] == 88
        assert rows[0]["submitted_at"] == date(2026, 6, 18)

    def test_the_later_submission_wins_even_when_listed_first(self):
        """靠日期决定，不是靠出现次序。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-18", "88", "", "", ""],
            ["学员甲", "alpha@example.com", "2026-06-11", "60", "", "", ""],
        )

        rows = parse(text, source="s.csv").rows

        assert len(rows) == 1
        assert rows[0]["total"] == 88

    def test_same_timestamp_keeps_the_later_line(self):
        """日期并列时取文件里靠后的那一行。用不同的总分来分辨取到了哪一条。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-11", "60", "", "", ""],
            ["学员甲", "alpha@example.com", "2026-06-11", "88", "", "", ""],
        )

        rows = parse(text, source="s.csv").rows

        assert len(rows) == 1
        assert rows[0]["total"] == 88
        assert rows[0]["source_ref"] == "s.csv:3"

    def test_duplicates_are_reported(self):
        """被丢掉的那一行要说出来——18 行 / 17 人这个差额不该无声无息。"""
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-11", "60", "", "", ""],
            ["学员甲", "alpha@example.com", "2026-06-18", "88", "", "", ""],
        )

        assert parse(text, source="s.csv").superseded == ["s.csv:2"]

    def test_two_different_people_are_not_merged(self):
        text = _csv(
            ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
            ["学员甲", "alpha@example.com", "2026-06-11", "60", "", "", ""],
            ["学员乙", "bravo@example.com", "2026-06-11", "88", "", "", ""],
        )

        assert len(parse(text, source="s.csv").rows) == 2


def test_names_are_returned_for_reporting_only():
    """姓名带出来只为了报告可读；关联一律用邮箱。

    微信昵称与姓名都会变，邮箱不会——CLAUDE.md §5。
    """
    text = _csv(
        ["姓名", "邮件", "提交时间", "总分", "亮点", "改进建议", "回复状态"],
        ["学员甲", "alpha@example.com", "2026-06-20", "73", "", "", ""],
    )

    assert parse(text, source="s.csv").names["alpha@example.com"] == "学员甲"
