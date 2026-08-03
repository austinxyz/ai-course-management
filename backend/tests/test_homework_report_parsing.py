"""批改报告（`{姓名}_{日期}_report.md`）的解析：字节 → 逐分项评语 + 整体评语。

全部纯函数——不读文件、不碰数据库。跟 `homework_parsing.py` 同一个理由分开：
表格格式、段落切分最容易悄悄出错，而错了从页面上看不出来。

夹具文本用虚构姓名与场景，不是真实学员数据。
"""

import pytest

from app.homework_report_parsing import BadReport, MalformedReportCell, parse_report

SAMPLE_REPORT = """## 学员姓名：小明
### 总分：68 / 100 分

| 维度 | 得分 | 满分 | 评语 |
|------|------|------|------|
| A1 工作流结构 | 13 | 15 | 两个 Agent 分工清晰，设计逻辑扎实。 |
| A2 数据传递 | 6 | 10 | 隐含文件传递，但未写明 OUTPUTS/ 路径。 |
| D2 心得深度 | 9 | 10 | 5 条以上具体个人观察，洞察深刻。 |

### 亮点
1. 场景选择专业，双层框架设计体现了真实业务思维。
2. 心得质量出色，有批判性思考。

### 改进建议
1. 补全 OUTPUTS/ 路径。
2. 为每个 Agent 加上角色定义。

### 讲师回复草稿
小明，这份作业领域选择很有深度……

---
## 作业原文

【1. 我的 Agent 提示词】
（此处省略原文内容）
"""


class TestParseReport:
    def test_parses_dimension_items_with_code_prefix(self):
        result = parse_report(SAMPLE_REPORT)

        codes = [item["code"] for item in result.items]
        assert codes == ["A1", "A2", "D2"]
        assert result.items[0] == {
            "code": "A1",
            "score": 13,
            "max": 15,
            "comment": "两个 Agent 分工清晰，设计逻辑扎实。",
        }

    def test_parses_the_total_score_line(self):
        result = parse_report(SAMPLE_REPORT)

        assert result.total == 68

    def test_parses_overall_highlight_and_improve(self):
        result = parse_report(SAMPLE_REPORT)

        assert "场景选择专业" in result.highlight
        assert "批判性思考" in result.highlight
        assert "补全 OUTPUTS/ 路径" in result.improve
        assert "角色定义" in result.improve

    def test_does_not_capture_reply_draft_or_original_submission(self):
        result = parse_report(SAMPLE_REPORT)

        combined = result.highlight + result.improve + str(result.items)
        assert "讲师回复草稿" not in combined
        assert "我的 Agent 提示词" not in combined
        assert "小明，这份作业领域选择很有深度" not in combined


class TestMalformedReport:
    def test_non_numeric_score_raises_readable_error(self):
        text = SAMPLE_REPORT.replace(
            "| A1 工作流结构 | 13 | 15 |", "| A1 工作流结构 | 十三 | 15 |"
        )

        with pytest.raises(MalformedReportCell) as exc_info:
            parse_report(text)

        message = str(exc_info.value)
        assert "A1" in message
        assert "十三" in message

    def test_a_file_with_no_table_rows_is_rejected(self):
        text = "# 这不是批改报告\n\n只是一段无关的文字。\n"

        with pytest.raises(BadReport):
            parse_report(text)
