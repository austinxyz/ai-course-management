"""规划逻辑的测试。夹具是手写的虚构课程，不打真库。

"哪门课挂到哪几场"是这次导入最容易错位、也最难事后发现的地方 ——
所以它由纯函数承担，并在这里被逐条钉住。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from planning import normalize_alias, plan  # noqa: E402

DATA = {
    "defaults": {
        "duration_minutes": 150,
        "default_tz": "America/New_York",
        "session_time": "20:30",
        "teacher": "Austin Xu",
    },
    "courses": [
        {
            "short": "S1",
            "name": "第一门课",
            "aliases": ["S1", "First Course"],
            "tagline": "定位",
            "intro": "介绍",
            "homework_title": "作业",
            "sessions": [{"date": "2026-06-28"}],
        }
    ],
}


def existing_course(**kw):
    base = {
        "id": "c-1",
        "name": "占位名",
        "aliases": [],
        "sessions": [],
    }
    return {**base, **kw}


def test_a_course_with_no_matching_alias_is_created():
    actions = plan(DATA, [])

    assert [a["action"] for a in actions] == ["create"]
    assert actions[0]["fields"]["duration_minutes"] == 150
    assert actions[0]["fields"]["default_tz"] == "America/New_York"
    assert actions[0]["aliases"] == ["S1", "First Course"]


def test_an_existing_alias_makes_it_an_update_not_a_duplicate():
    """生产上那条内容是占位、但握着别名 S1 的记录，应当被就地改造 ——
    而不是再建一门同别名的课（那会撞主键）。"""
    existing = existing_course(name="占位名", aliases=[{"raw": "S1"}])

    actions = plan(DATA, [existing])

    assert actions[0]["action"] == "update"
    assert actions[0]["course_id"] == "c-1"
    assert actions[0]["current_name"] == "占位名"
    assert actions[0]["fields"]["name"] == "第一门课"


def test_matching_ignores_case_and_whitespace():
    """平台导出的写法不受我们控制。"""
    existing = existing_course(aliases=[{"raw": " s1 "}])

    assert plan(DATA, [existing])[0]["action"] == "update"


def test_only_the_missing_aliases_are_added():
    """别名主键是归一化值，重复添加会 409 —— 已有的不该再发一次。"""
    existing = existing_course(aliases=[{"raw": "S1"}])

    assert plan(DATA, [existing])[0]["aliases"] == ["First Course"]


def test_matching_never_uses_the_course_name():
    """课程名会改（设计里明写改名要同步别名），所以它不能当匹配键。
    同名但别名不同 = 两门不同的课。"""
    existing = existing_course(name="第一门课", aliases=[{"raw": "别的"}])

    assert plan(DATA, [existing])[0]["action"] == "create"


def test_sessions_are_deduped_by_date_time_and_zone():
    """重跑不该把同一场加两遍。库里回来的时间是 20:30:00，清单里写的是 20:30。"""
    existing = existing_course(
        aliases=[{"raw": "S1"}],
        sessions=[
            {
                "local_date": "2026-06-28",
                "local_time": "20:30:00",
                "tz": "America/New_York",
            }
        ],
    )

    assert plan(DATA, [existing])[0]["sessions"] == []


def test_a_session_at_another_time_is_not_the_same_session():
    existing = existing_course(
        aliases=[{"raw": "S1"}],
        sessions=[
            {"local_date": "2026-06-28", "local_time": "19:30:00", "tz": "America/New_York"}
        ],
    )

    assert [s["local_time"] for s in plan(DATA, [existing])[0]["sessions"]] == ["20:30"]


def test_sessions_in_the_database_but_not_in_the_list_are_reported_not_deleted():
    """生产那条占位记录上挂着几场假场次。删除是决定，不交给批处理 ——
    脚本只把它们列出来，由人在界面上删。"""
    stale = {
        "local_date": "2026-10-15",
        "local_time": "19:30:00",
        "tz": "America/Los_Angeles",
        "teacher": "Austin",
    }
    existing = existing_course(aliases=[{"raw": "S1"}], sessions=[stale])

    action = plan(DATA, [existing])[0]

    assert action["extras"] == [stale]
    # 缺的那场仍要补上
    assert [s["local_date"] for s in action["sessions"]] == ["2026-06-28"]


def test_session_defaults_come_from_the_defaults_block():
    action = plan(DATA, [])[0]

    assert action["sessions"] == [
        {
            "local_date": "2026-06-28",
            "local_time": "20:30",
            "tz": "America/New_York",
            "teacher": "Austin Xu",
            "note": "",
        }
    ]


def test_normalize_alias_matches_the_backend_rule():
    assert normalize_alias(" S1 ") == "s1"
    assert normalize_alias("Claude & Cowork From Zero") == "claude & cowork from zero"
