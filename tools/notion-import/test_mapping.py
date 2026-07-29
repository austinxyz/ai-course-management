"""Tests for the Notion -> students field mapping.

All fixtures are fictional (CLAUDE.md §隐私). Run from the repo root:

    python -m pytest tools/notion-import
"""

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from mapping import DEFAULTS, IMPORT_TAG, map_page, map_pages, mask_email  # noqa: E402


def make_page(
    name: str = "测试学员",
    email: str | None = "test.student@example.com",
    wechat: str = "",
    note: str = "",
    tags: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "properties": {
            "姓名": {"title": [{"plain_text": name}] if name else []},
            "邮箱": {"email": email},
            "微信": {"rich_text": [{"plain_text": wechat}] if wechat else []},
            "备注": {"rich_text": [{"plain_text": note}] if note else []},
            "标签": {"multi_select": [{"name": t} for t in (tags or [])]},
        }
    }


def test_maps_core_fields():
    body = map_page(make_page(name="张三", note="面试过一次", wechat="wx_demo"))
    assert body["name"] == "张三"
    assert body["email"] == "test.student@example.com"
    assert body["note"] == "面试过一次"
    assert body["wechat"] == "wx_demo"


def test_applies_instructor_chosen_defaults():
    body = map_page(make_page())
    assert {k: body[k] for k in DEFAULTS} == DEFAULTS


def test_every_record_carries_the_import_tag():
    assert map_page(make_page())["tags"] == [IMPORT_TAG]


def test_excellent_tag_is_renamed():
    body = map_page(make_page(tags=["优秀学员"]))
    assert body["tags"] == ["作业优秀", IMPORT_TAG]


def test_unmapped_tags_are_dropped():
    # 兴趣小组候选 was explicitly abandoned; an unknown tag must not invent one.
    body = map_page(make_page(tags=["兴趣小组候选", "某个新标签"]))
    assert body["tags"] == [IMPORT_TAG]


def test_empty_optional_properties_become_empty_strings():
    body = map_page(make_page())
    assert body["wechat"] == ""
    assert body["note"] == ""


def test_page_without_email_is_skipped():
    assert map_page(make_page(email=None)) is None
    assert map_page(make_page(email="")) is None


def test_page_without_name_is_skipped():
    assert map_page(make_page(name="")) is None


def test_multi_part_rich_text_is_joined():
    page = make_page()
    page["properties"]["备注"] = {
        "rich_text": [{"plain_text": "前半 "}, {"plain_text": "后半"}]
    }
    assert map_page(page)["note"] == "前半 后半"


def test_map_pages_reports_skipped_names():
    bodies, skipped = map_pages(
        [make_page(name="有邮箱"), make_page(name="无邮箱", email=None)]
    )
    assert [b["name"] for b in bodies] == ["有邮箱"]
    assert skipped == ["无邮箱"]


def test_mask_email_keeps_only_a_prefix():
    assert mask_email("longlocalpart@example.com") == "lon…@example.com"
    assert mask_email("ab@example.com") == "ab@example.com"
