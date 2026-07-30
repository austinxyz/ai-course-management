"""把 courses.json 与库里现有课程比对，算出要做哪些动作。

纯函数，不发请求、不读环境变量。所有网络与凭据都在 import_courses.py 里 ——
这样"哪门课挂到哪几场"这件最容易错位的事可以用手写夹具测，而不必打真库。
"""

from typing import Any

Course = dict[str, Any]


def normalize_alias(raw: str) -> str:
    """与后端同一套规则：去首尾空白 + 转小写。

    平台导出的写法不受我们控制，`S1`、`s1`、` S1 ` 指同一门课。这里重复实现是有意的：
    脚本要在**发请求之前**就知道自己会不会撞上已有别名，从而在 dry-run 里说清楚。
    """
    return raw.strip().lower()


def course_fields(entry: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    """courses.json 的一条 → 课程写请求的 body。"""
    return {
        "name": entry["name"],
        "short": entry["short"],
        "tagline": entry["tagline"],
        "intro": entry["intro"],
        "homework_title": entry["homework_title"],
        "duration_minutes": defaults["duration_minutes"],
        "default_tz": defaults["default_tz"],
    }


def session_fields(session: dict[str, Any], defaults: dict[str, Any]) -> dict[str, Any]:
    """一场的写请求 body。时间与讲师取默认值——门户上没有逐场的讲师。"""
    return {
        "local_date": session["date"],
        "local_time": session.get("time", defaults["session_time"]),
        "tz": session.get("tz", defaults["default_tz"]),
        "teacher": session.get("teacher", defaults["teacher"]),
        "note": session.get("note", ""),
    }


def _match(entry: dict[str, Any], existing: list[Course]) -> Course | None:
    """按别名找现有课程。

    不按课程名匹配：课程名会改（设计里明写「课程名改了要同步平台别名」），
    而别名的**唯一用途**就是稳定地指向同一门课。副作用正是我们要的——
    生产上那条内容是占位、但握着别名 `S1` 的记录，会被认成 S1 本身而就地改造。
    """
    wanted = {normalize_alias(a) for a in entry["aliases"]}
    for course in existing:
        owned = {normalize_alias(a["raw"]) for a in course.get("aliases", [])}
        if wanted & owned:
            return course
    return None


def plan(data: dict[str, Any], existing: list[Course]) -> list[dict[str, Any]]:
    """算出每门课的动作。不写任何东西，只描述将要发生什么。

    每项包含：
      action      "create" | "update"
      course_id   update 时指向现有课程
      fields      课程字段
      aliases     还缺的别名（已有的不重复加——别名主键是归一化值，重复会 409）
      sessions    还缺的场次（按 日期+时间+时区 去重，重跑不会加两遍）
      extras      库里有、但导入清单里没有的场次；**只报告，不删除**
    """
    defaults = data["defaults"]
    actions: list[dict[str, Any]] = []

    for entry in data["courses"]:
        match = _match(entry, existing)
        desired_sessions = [session_fields(s, defaults) for s in entry["sessions"]]

        if match is None:
            actions.append(
                {
                    "action": "create",
                    "short": entry["short"],
                    "course_id": None,
                    "fields": course_fields(entry, defaults),
                    "aliases": list(entry["aliases"]),
                    "sessions": desired_sessions,
                    "extras": [],
                }
            )
            continue

        owned = {normalize_alias(a["raw"]) for a in match.get("aliases", [])}
        missing_aliases = [a for a in entry["aliases"] if normalize_alias(a) not in owned]

        def key(s: dict[str, Any]) -> tuple[str, str, str]:
            # 时间可能回来是 "20:30:00"，清单里写的是 "20:30" —— 只比到分钟。
            return (s["local_date"], s["local_time"][:5], s["tz"])

        have = {key(s) for s in match.get("sessions", [])}
        missing_sessions = [s for s in desired_sessions if key(s) not in have]

        wanted_keys = {key(s) for s in desired_sessions}
        extras = [s for s in match.get("sessions", []) if key(s) not in wanted_keys]

        actions.append(
            {
                "action": "update",
                "short": entry["short"],
                "course_id": match["id"],
                "current_name": match["name"],
                "fields": course_fields(entry, defaults),
                "aliases": missing_aliases,
                "sessions": missing_sessions,
                "extras": extras,
            }
        )

    return actions
