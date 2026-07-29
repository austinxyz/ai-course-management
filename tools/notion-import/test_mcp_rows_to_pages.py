"""Tests for the MCP-row adapter. Fictional data only (CLAUDE.md §隐私)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from mapping import IMPORT_TAG, map_page  # noqa: E402
from mcp_rows_to_pages import to_page  # noqa: E402


def test_row_round_trips_through_the_real_mapping():
    row = {
        "姓名": "张三",
        "邮箱": "zhang.san@example.com",
        "微信": None,
        "备注": "面试过一次",
        "标签": '["优秀学员"]',
    }
    body = map_page(to_page(row))
    assert body["name"] == "张三"
    assert body["email"] == "zhang.san@example.com"
    assert body["note"] == "面试过一次"
    assert body["wechat"] == ""
    assert body["tags"] == ["作业优秀", IMPORT_TAG]


def test_json_encoded_multi_select_is_decoded_not_passed_through():
    # If the '["优秀学员"]' string were kept whole it would miss TAG_MAP and the
    # 作业优秀 tag would vanish without any error.
    page = to_page({"姓名": "李四", "邮箱": "li.si@example.com", "标签": '["优秀学员"]'})
    assert page["properties"]["标签"]["multi_select"] == [{"name": "优秀学员"}]


def test_null_properties_produce_empty_lists():
    page = to_page({"姓名": "王五", "邮箱": None, "微信": None, "备注": None, "标签": None})
    assert page["properties"]["备注"]["rich_text"] == []
    assert page["properties"]["标签"]["multi_select"] == []
    assert map_page(page) is None
