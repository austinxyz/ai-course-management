"""Notion 学员库 page -> POST /api/students body.

Pure functions only: no network, no environment, no printing. Everything that
talks to Notion or the backend lives in import_students.py, so the mapping
rules — which are the part that is easy to get quietly wrong — can be tested
against hand-written page dicts with fictional data.

Field mapping is specified in
docs/superpowers/specs/2026-07-29-notion-import-design.md §字段映射.
"""

from typing import Any

# Notion property names, as created by ai-course/tools/student-sync.
PROP_NAME = "姓名"
PROP_EMAIL = "邮箱"
PROP_WECHAT = "微信"
PROP_NOTE = "备注"
PROP_TAGS = "标签"

# Notion 标签 -> students.tags. A Notion tag absent from this map is dropped:
# 兴趣小组候选 exists on exactly one record and the instructor decided against
# carrying it over, and an unlisted future tag should not silently invent a
# category on this side.
TAG_MAP: dict[str, str] = {"优秀学员": "作业优秀"}

# Stamped on every imported record. These 18 rows carry three values that were
# not derived from any data (see DEFAULTS below) and are indistinguishable from
# verified ones once stored. This tag is what makes them retrievable as a batch
# for later verification. It goes in tags rather than note because note holds
# hand-written instructor text — the one input in this import that cannot be
# regenerated — and mixing machine text into it would spoil it.
IMPORT_TAG = "Phase1导入"

# Not derived from Notion. region/level/source are required enums on the API
# and the enums have no "unknown" member, so these are an instructor-chosen
# uniform placeholder. See IMPORT_TAG above.
DEFAULTS: dict[str, str] = {
    "region": "美东",
    "level": "有基础",
    "source": "讲武堂",
}


def _plain_text(prop: dict[str, Any] | None) -> str:
    """Join a title/rich_text property into a plain string."""
    if not prop:
        return ""
    parts = prop.get("title") or prop.get("rich_text") or []
    return "".join(part.get("plain_text", "") for part in parts).strip()


def _email(prop: dict[str, Any] | None) -> str:
    if not prop:
        return ""
    return (prop.get("email") or "").strip()


def _multi_select(prop: dict[str, Any] | None) -> list[str]:
    if not prop:
        return []
    return [item.get("name", "") for item in prop.get("multi_select") or []]


def map_page(page: dict[str, Any]) -> dict[str, Any] | None:
    """Map one Notion page to a StudentCreate body, or None to skip it.

    Skipped when the page has no email: email is the primary key of the target
    table and the join key against grades.csv and EliteCoach101. Three Phase 1
    records have no email and are explicitly out of scope — inventing one would
    put a row in the roster that can never be joined to anything.
    """
    props = page.get("properties", {})

    email = _email(props.get(PROP_EMAIL))
    name = _plain_text(props.get(PROP_NAME))
    if not email or not name:
        return None

    tags = [TAG_MAP[t] for t in _multi_select(props.get(PROP_TAGS)) if t in TAG_MAP]
    tags.append(IMPORT_TAG)

    return {
        "email": email,
        "name": name,
        "wechat": _plain_text(props.get(PROP_WECHAT)),
        "note": _plain_text(props.get(PROP_NOTE)),
        "tags": tags,
        **DEFAULTS,
    }


def map_pages(pages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Map every page. Returns (bodies, names of skipped pages).

    The skipped names are returned rather than logged so the caller decides
    whether to print them — this data is real students'.
    """
    bodies: list[dict[str, Any]] = []
    skipped: list[str] = []
    for page in pages:
        body = map_page(page)
        if body is None:
            skipped.append(_plain_text(page.get("properties", {}).get(PROP_NAME)))
        else:
            bodies.append(body)
    return bodies, skipped


def mask_email(email: str) -> str:
    """Shorten an email for terminal output.

    Dry-run output ends up in terminal scrollback, CI logs and agent
    transcripts (CLAUDE.md §隐私). Enough is kept to tell records apart, not
    enough to be a usable address list. --reveal turns this off for the local
    field-by-field verification run.
    """
    local, _, domain = email.partition("@")
    head = local[:3]
    return f"{head}{'…' if len(local) > 3 else ''}@{domain}"
