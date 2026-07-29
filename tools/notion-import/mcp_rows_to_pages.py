"""Convert Notion MCP query rows into the page shape import_students expects.

    python tools/notion-import/mcp_rows_to_pages.py rows.json pages.json

Phase 1 never had a Notion integration token — the 学员库 was always driven
through the MCP connector (ai-course/docs/student-management-guide.md), which a
standalone script cannot call. So the export is done in an agent session with

    SELECT "姓名", "邮箱", "微信", "备注", "标签" FROM "collection://<id>"

and this adapter turns those flat rows into the property dicts the Notion REST
API would have returned, so that import_students.py and mapping.py — the code
that was actually tested — run unchanged on the same input.

Both files hold real student data. Keep them outside the repo (CLAUDE.md §隐私).
"""

import json
import sys
from typing import Any

from mapping import PROP_EMAIL, PROP_NAME, PROP_NOTE, PROP_TAGS, PROP_WECHAT


def _text(value: str | None) -> dict[str, Any]:
    # rich_text and title differ only in the key; mapping._plain_text accepts
    # either, so one builder covers both.
    return {"rich_text": [{"plain_text": value}] if value else []}


def _title(value: str | None) -> dict[str, Any]:
    return {"title": [{"plain_text": value}] if value else []}


def _tags(value: str | list[str] | None) -> dict[str, Any]:
    # The MCP SQL layer hands multi_select back as a JSON-encoded string, e.g.
    # '["优秀学员"]'. Passing that through as one opaque name would silently
    # produce a tag nobody mapped, so it is decoded here.
    if not value:
        names: list[str] = []
    elif isinstance(value, str):
        names = json.loads(value)
    else:
        names = value
    return {"multi_select": [{"name": name} for name in names]}


def to_page(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "properties": {
            PROP_NAME: _title(row.get(PROP_NAME)),
            PROP_EMAIL: {"email": row.get(PROP_EMAIL)},
            PROP_WECHAT: _text(row.get(PROP_WECHAT)),
            PROP_NOTE: _text(row.get(PROP_NOTE)),
            PROP_TAGS: _tags(row.get(PROP_TAGS)),
        }
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    rows = json.loads(open(argv[1], encoding="utf-8").read())
    pages = [to_page(row) for row in rows]
    with open(argv[2], "w", encoding="utf-8") as out:
        json.dump(pages, out, ensure_ascii=False, indent=1)
    print(f"{len(pages)} rows -> {argv[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
