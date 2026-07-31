"""倒推逻辑的测试。夹具全部虚构，不读真实的 grades.csv，也不打真库。

"谁上过哪门课"这件事一旦推错，事后极难发现——错的记录看起来和对的一模一样。
所以它全部由纯函数承担，并在这里逐条钉住。
"""

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from planning import (  # noqa: E402
    UnknownCourse,
    enrolled_at_for,
    normalize_alias,
    plan,
    read_submissions,
)

# 虚构课程表：形状与 GET /api/courses 的返回一致，只留用得到的字段。
COURSES = [
    {
        "id": "c-1",
        "name": "从零开始",
        "aliases": [{"raw": "S1"}],
        "sessions": [
            {"local_date": "2026-06-14"},
            {"local_date": "2026-06-07"},  # 故意不按顺序：取最早那场，不是第一条
        ],
    },
    {
        "id": "c-2",
        "name": "先造枪",
        "aliases": [{"raw": " s2 "}],  # 首尾空白 + 小写：归一化后仍应匹配 session2
        "sessions": [{"local_date": "2026-07-12"}],
    },
]


def write_csv(tmp_path: Path, name: str, rows: list[tuple[str, str]]) -> Path:
    """写一份最小的 grades.csv：只有脚本会读的那几列。"""
    d = tmp_path / name
    d.mkdir()
    lines = ["姓名,邮件,提交时间,总分,A1某项"]
    lines += [f"{n},{e},2026-06-20 10:00,88,5" for n, e in rows]
    (d / "grades.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return d


def test_reads_email_per_submission(tmp_path):
    d = write_csv(tmp_path, "session1", [("学员甲", "alpha@example.com"), ("学员乙", "bravo@example.com")])

    assert read_submissions(d / "grades.csv") == ["alpha@example.com", "bravo@example.com"]


def test_the_same_person_submitting_twice_counts_once(tmp_path):
    """真实数据里 session1 是 18 行 17 人——有人对同一门课交了两次。

    去重不是为了省事：不去重的话第二条会撞唯一约束，把一次正常导入变成一堆"冲突"，
    而真正的冲突（重跑）就淹没在里面了。
    """
    d = write_csv(
        tmp_path,
        "session1",
        [("学员甲", "alpha@example.com"), ("学员甲", "ALPHA@example.com"), ("学员乙", "bravo@example.com")],
    )

    result = plan([(("session1"), d / "grades.csv")], COURSES, roster={"alpha@example.com", "bravo@example.com"})

    assert [r.student_email for r in result.to_create] == ["alpha@example.com", "bravo@example.com"]


def test_alias_matching_ignores_case_and_padding(tmp_path):
    d = write_csv(tmp_path, "session2", [("学员甲", "alpha@example.com")])

    result = plan([("session2", d / "grades.csv")], COURSES, roster={"alpha@example.com"})

    assert result.to_create[0].course_id == "c-2"


def test_an_unknown_alias_stops_rather_than_guessing(tmp_path):
    """目录名与课程的对应关系不能是脚本里的一个秘密。

    别名查不到就中止：硬编码 {"session1": "S1"} 看起来更短，但课程改名或别名调整之后
    脚本会继续按旧映射写入，而且没有任何征兆。
    """
    d = write_csv(tmp_path, "session9", [("学员甲", "alpha@example.com")])

    with pytest.raises(UnknownCourse) as excinfo:
        plan([("session9", d / "grades.csv")], COURSES, roster={"alpha@example.com"})

    assert "s9" in str(excinfo.value)


def test_enrolled_at_is_the_earliest_session_of_that_course():
    """作业成绩里没有报名时间；提交时间必然晚于报名。取最早一场，语义是"这一期的人"。"""
    assert enrolled_at_for(COURSES[0]) == date(2026, 6, 7)


def test_a_course_without_sessions_stops():
    """没有日期可取。编一个（比如今天）会让这条记录看起来像今天报的。"""
    with pytest.raises(UnknownCourse):
        enrolled_at_for({"id": "c-3", "name": "还没排课", "aliases": [], "sessions": []})


def test_people_outside_the_roster_are_listed_not_created(tmp_path):
    """students 的 region/level/source 都是必填，而 CSV 里只有姓名与邮箱——
    自动建档就得给这三项编值。且姓名可能是群昵称残留。
    """
    d = write_csv(
        tmp_path,
        "session1",
        [("学员甲", "alpha@example.com"), ("陌生人", "stranger@example.com")],
    )

    result = plan([("session1", d / "grades.csv")], COURSES, roster={"alpha@example.com"})

    assert [r.student_email for r in result.to_create] == ["alpha@example.com"]
    assert result.missing_students == ["stranger@example.com"]


def test_every_planned_record_is_derived_and_undecided(tmp_path):
    d = write_csv(tmp_path, "session1", [("学员甲", "alpha@example.com")])

    row = plan([("session1", d / "grades.csv")], COURSES, roster={"alpha@example.com"}).to_create[0]

    assert row.source == "derived"
    assert row.session_id is None
    assert row.enrolled_at == date(2026, 6, 7)


def test_normalize_alias_matches_the_backend_rule():
    assert normalize_alias(" S1 ") == "s1"


def test_an_empty_file_is_skipped_with_a_reason(tmp_path):
    """真实的 session4 是 0 行，且表头与 session3 高度重合——`session4 → S4` 这条映射
    没有证据。空文件跳过时要**说明原因**，不能静默略过：静默的话，
    "它没被导入"与"它导入了但一条都没有"分不出来。
    """
    empty = write_csv(tmp_path, "session4", [])
    ok = write_csv(tmp_path, "session1", [("学员甲", "alpha@example.com")])

    result = plan(
        [("session4", empty / "grades.csv"), ("session1", ok / "grades.csv")],
        COURSES,
        roster={"alpha@example.com"},
    )

    assert result.skipped_dirs == [("session4", "文件里没有任何提交记录")]
    assert len(result.to_create) == 1


def test_an_empty_file_does_not_need_a_known_alias(tmp_path):
    """0 行的目录连课程都不必认得出来——没有东西要导，就不该因为别名认不出而中止。

    这正是 session4 的处境：它的映射存疑，而我们既不想猜、也不想让它挡住其余目录。
    """
    empty = write_csv(tmp_path, "session9", [])

    result = plan([("session9", empty / "grades.csv")], COURSES, roster=set())

    assert result.skipped_dirs == [("session9", "文件里没有任何提交记录")]
    assert result.to_create == []


def test_excluded_emails_never_become_enrollments(tmp_path):
    """讲师自己的测试提交不是报课。

    靠"他碰巧不在学员库里"来排除是脆的——哪天他被加进名单，这些记录就会
    静默地变成报课。要显式排除，且**排除优先于一切**：不进创建列表，
    也不进"未建档"名单（他不是待补建的学员）。
    """
    d = write_csv(
        tmp_path,
        "session1",
        [("讲师", "teacher@example.com"), ("学员甲", "alpha@example.com")],
    )

    result = plan(
        [("session1", d / "grades.csv")],
        COURSES,
        roster={"alpha@example.com", "teacher@example.com"},
        exclude={"TEACHER@example.com"},  # 大小写不敏感
    )

    assert [r.student_email for r in result.to_create] == ["alpha@example.com"]
    assert result.missing_students == []
    assert result.excluded == ["teacher@example.com"]
