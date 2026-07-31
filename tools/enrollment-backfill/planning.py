"""从作业成绩倒推报课记录的规划逻辑。

全部是纯函数：读 CSV、去重、匹配课程、推日期。写入在 `backfill.py` 里，
这样"谁上过哪门课"这件最容易错位、也最难事后发现的事可以被单独钉住。

前提是一句话：**一个学员如果有某门课的作业成绩，他必然报过那门课。**
批次（场次）推不出来——作业成绩说不出他上的是哪一场——所以全部落成"未定场次"。
"""

import csv
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable


class UnknownCourse(Exception):
    """课程认不出来，或课程没有可用的日期。**中止**而不是猜。"""


@dataclass(frozen=True)
class PlannedEnrollment:
    """将要创建的一条报课。"""

    student_email: str
    course_id: str
    course_name: str
    enrolled_at: date
    # 作业成绩说不出他上的是哪一场，所以恒为 None。留成字段而不是省略，
    # 是为了让"未定场次"在计划输出里显式可见。
    session_id: None = None
    # 从别处的既有记录推出来的占位——不是人特意录的（manual），也不是平台给的（platform）。
    # 将来平台数据接上时，这三者的区别决定哪些可以被覆盖。
    source: str = "derived"


@dataclass(frozen=True)
class Plan:
    to_create: list[PlannedEnrollment]
    missing_students: list[str]
    skipped_dirs: list[tuple[str, str]]  # (目录名, 原因)
    # 显式排除的邮箱（讲师自己的测试提交之类）。与 missing_students 分开列：
    # 那是"待补建的学员"，这是"本来就不该算报课的人"。
    excluded: list[str] = field(default_factory=list)


def normalize_alias(raw: str) -> str:
    """与后端、与 `tools/course-import` 同一套规则：去首尾空白 + 转小写。

    重复实现是有意的：脚本要在发请求**之前**就知道自己认不认得出这门课，
    从而在 dry-run 里说清楚，而不是等写入时才 404。
    """
    return raw.strip().lower()


def read_submissions(path: Path) -> list[str]:
    """一份 grades.csv → 提交者邮箱列表（按出现顺序，不去重）。

    只读 `邮件` 一列。分数、评分项、提交时间都不读——本脚本只取
    "存在即报过课"这一个事实，成绩本身归作业能力。
    """
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = csv.DictReader(fh)
        return [
            row["邮件"].strip()
            for row in rows
            if (row.get("邮件") or "").strip()
        ]


def find_course(directory: str, courses: list[dict[str, Any]]) -> dict[str, Any]:
    """`session1` → 别名 `s1` → 课程。

    靠别名查而不是硬编码 `{"session1": "S1"}`：后者把目录名与课程的对应关系变成
    脚本里的一个秘密，课程改名或别名调整之后脚本会继续按旧映射写入，且没有任何征兆。
    """
    wanted = normalize_alias(directory.replace("session", "s"))
    for course in courses:
        if any(normalize_alias(a["raw"]) == wanted for a in course.get("aliases", [])):
            return course
    raise UnknownCourse(
        f"{directory}：没有别名等于 {wanted!r} 的课程。"
        f"先在课程页给它加上这个别名，或确认这个目录该不该导。"
    )


def enrolled_at_for(course: dict[str, Any]) -> date:
    """报名日期取该课程**最早一场**的日期。

    作业成绩里没有报名时间；`提交时间` 必然晚于报名。取最早一场，语义是"这一期的人"。
    它仍是推出来的值——这正是 `source = derived` 要标记的东西。

    没有任何场次时中止：没有日期可取，编一个（比如今天）会让这条记录看起来像今天报的。
    """
    days = [date.fromisoformat(s["local_date"]) for s in course.get("sessions", [])]
    if not days:
        raise UnknownCourse(
            f"课程「{course['name']}」还没有任何场次，推不出报名日期。先给它排一场。"
        )
    return min(days)


def plan(
    sources: Iterable[tuple[str, Path]],
    courses: list[dict[str, Any]],
    roster: set[str],
    exclude: set[str] | None = None,
) -> Plan:
    """(目录名, grades.csv 路径) 的若干份 → 将要创建的报课。

    `exclude` 里的邮箱一概不算报课（讲师自己的测试提交之类）。**排除优先于一切**——
    不进创建列表，也不进"未建档"名单：他不是待补建的学员。
    靠"他碰巧不在学员库里"来排除是脆的：哪天他被加进名单，记录就会静默变成报课。

    `roster` 是学员库里已有的邮箱。匹配不到的**列出来但不建档**：
    `students` 的 region / level / source 都是必填而 CSV 里只有姓名与邮箱，
    自动建就得给这三项编值。
    """
    to_create: list[PlannedEnrollment] = []
    missing: list[str] = []
    skipped: list[tuple[str, str]] = []
    excluded: list[str] = []
    lower_roster = {e.strip().lower() for e in roster}
    lower_exclude = {e.strip().lower() for e in (exclude or set())}

    for directory, path in sources:
        emails = read_submissions(path)
        if not emails:
            skipped.append((directory, "文件里没有任何提交记录"))
            continue

        course = find_course(directory, courses)
        day = enrolled_at_for(course)

        seen: set[str] = set()
        for raw_email in emails:
            email = raw_email.lower()
            # 同一门课交两次的人只得一条。不去重的话第二条会撞唯一约束，
            # 把一次正常导入变成一堆"冲突"，真正的冲突（重跑）就淹没在里面了。
            if email in seen:
                continue
            seen.add(email)

            if email in lower_exclude:
                if email not in excluded:
                    excluded.append(email)
                continue

            if email not in lower_roster:
                if email not in missing:
                    missing.append(email)
                continue

            to_create.append(
                PlannedEnrollment(
                    student_email=email,
                    course_id=course["id"],
                    course_name=course["name"],
                    enrolled_at=day,
                )
            )

    return Plan(
        to_create=to_create,
        missing_students=missing,
        skipped_dirs=skipped,
        excluded=excluded,
    )
