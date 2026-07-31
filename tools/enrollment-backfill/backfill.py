"""从作业成绩倒推报课记录（一次性）。

    python tools/enrollment-backfill/backfill.py            # dry-run，只读
    python tools/enrollment-backfill/backfill.py --apply    # 唯一会写的路径

前提是一句话：**一个学员如果有某门课的作业成绩，他必然报过那门课。**
批次推不出来，所以全部落成"未定场次"——那是模型里的一等状态，不是缺陷。

不提供 `--undo`：只在出错时才跑的删除路径，本身就是没被测过的危险代码。
要撤销就用界面上的删除入口，条数不多。
"""

import argparse
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from planning import (  # noqa: E402
    Plan,
    PlannedEnrollment,
    UnknownCourse,
    plan,
    read_names,
)

# 作业成绩的所在。跨仓库**一次性读入**，不建立运行时依赖。
GRADES_ROOT = Path.home() / "projects/ai-course/tools/homework-grader"


@dataclass
class Outcome:
    created: int = 0
    already_there: int = 0
    failed: list[str] = field(default_factory=list)


def _detail(resp) -> str:
    """取后端给的 detail 原文；拿不到就空串（据此判断的分支会走失败那条，是安全方向）。"""
    try:
        return str(resp.json().get("detail", ""))
    except Exception:
        return ""


def push(
    client,
    base: str,
    headers: dict[str, str],
    rows: list[PlannedEnrollment],
) -> Outcome:
    """把计划里的每一条发过去。

    重跑幂等**靠数据库**：直接写，把 409 归类为"已存在"。不先查再写——
    那是 TOCTOU，且多一轮往返；而唯一约束本来就是权威。

    409 之外的失败要留下来：全部当成"已存在"会让一次半途而废的导入
    看起来和一次成功的重跑一模一样。
    """
    outcome = Outcome()
    for row in rows:
        resp = client.post(
            f"{base}/api/enrollments",
            json={
                "student_email": row.student_email,
                "course_id": row.course_id,
                "session_id": row.session_id,
                "enrolled_at": row.enrolled_at.isoformat(),
                "source": row.source,
                "note": "",
            },
            headers=headers,
            timeout=60,
        )
        if resp.status_code == 201:
            outcome.created += 1
        elif resp.status_code == 409 and "已经存在" in _detail(resp):
            # 后端对"已经存在"和"这门课已下线"都返回 409。一律当成"已存在"会让
            # "全都因为课下线而没写进去"看起来和"重跑，本来就都在"一模一样——
            # 而这两件事一个要处理、一个不用。
            outcome.already_there += 1
        else:
            outcome.failed.append(
                f"{row.student_email} / {row.course_name}: HTTP {resp.status_code} {_detail(resp)}"
            )
    return outcome


def _say(line: str = "") -> None:
    """打一行，且不因控制台编码而崩。

    Windows 控制台默认 cp1252，而这个脚本的输出整个是中文——直接 print 会在
    第一行就抛 UnicodeEncodeError，把一次**只读**的 dry-run 变成崩溃。
    而崩溃的样子跟"数据有问题"很像，最容易被误判。

    写进 stdout 的 buffer 并显式用 UTF-8 编码，绕开控制台自己的编码设定。
    """
    stream = getattr(sys.stdout, "buffer", None)
    if stream is None:
        print(line)
        return
    stream.write((line + "\n").encode("utf-8"))
    stream.flush()


def create_students(
    client,
    base: str,
    headers: dict[str, str],
    people: list[tuple[str, str]],
    *,
    region: str,
    level: str,
    source: str,
) -> int:
    """给这些 (邮箱, 姓名) 建学员档案。返回**新建**的条数。

    `region` / `level` / `source` **没有默认值**，必须由调用方给出。
    它们是必填枚举，而 CSV 里只有姓名与邮箱——留默认就等于替用户编一个，
    而编出来的「小白」在界面上看着和真的一模一样。

    姓名取自 CSV。CLAUDE.md 提醒过它可能是群昵称残留，所以它是**可改**的字段；
    这里只是把手上唯一有的东西放进去，不是断言它准确。

    已存在（409）不计入新建，也不算失败——重跑时这是预期。
    """
    made = 0
    for email, name in people:
        resp = client.post(
            f"{base}/api/students",
            json={
                "email": email,
                "name": name or email.split("@")[0],
                "region": region,
                "level": level,
                "source": source,
                "note": "由作业成绩带入建档，资料待补。",
            },
            headers=headers,
            timeout=60,
        )
        if resp.status_code == 201:
            made += 1
    return made


def describe(result: Plan) -> None:
    """把计划打出来。**只打邮箱与计数，不打姓名。**"""
    _say(f"\n将创建 {len(result.to_create)} 条报课（全部未定场次、来源 derived）：")
    by_course: dict[str, int] = {}
    for row in result.to_create:
        by_course[row.course_name] = by_course.get(row.course_name, 0) + 1
    for name, n in by_course.items():
        day = next(r.enrolled_at for r in result.to_create if r.course_name == name)
        _say(f"  {name}: {n} 条，报名日期取最早一场 {day}")

    if result.missing_students:
        _say(f"\n跳过 {len(result.missing_students)} 人——不在学员库里，且**不自动建档**：")
        for email in result.missing_students:
            _say(f"  {email}")
        _say("  （补建这些学员后重跑一次即可补上他们的报课）")

    if result.already_enrolled:
        _say(f"\n跳过 {len(result.already_enrolled)} 人——这门课已经有报课记录了：")
        for email in result.already_enrolled:
            _say(f"  {email}")
        _say("  （作业成绩只能证明「他报过这门课」，而那件事已经被既有记录表达了）")

    if result.excluded:
        _say(f"\n排除 {len(result.excluded)} 人——显式指定不算报课：")
        for email in result.excluded:
            _say(f"  {email}")

    if result.skipped_dirs:
        _say("\n跳过的目录：")
        for directory, why in result.skipped_dirs:
            _say(f"  {directory}：{why}")


def main() -> int:
    parser = argparse.ArgumentParser(description="从作业成绩倒推报课记录")
    parser.add_argument("--apply", action="store_true", help="真正写入（默认只做 dry-run）")
    parser.add_argument("--grades-root", default=str(GRADES_ROOT))
    parser.add_argument(
        "--create-missing",
        action="store_true",
        help="给「有成绩但不在学员库」的人建档。必须同时给出 --region/--level/--source。",
    )
    parser.add_argument("--region", help="建档用的区域（如 美东）")
    parser.add_argument("--level", help="建档用的基础（如 有基础）")
    parser.add_argument("--source", help="建档用的来源（如 讲武堂）")
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="EMAIL",
        help="这个邮箱的提交不算报课（讲师自己的测试提交之类）。可重复。",
    )
    args = parser.parse_args()

    base = os.environ["BACKEND_URL"].rstrip("/")
    headers = {"X-Backend-Secret": os.environ["BACKEND_SECRET"]}

    root = Path(args.grades_root)
    sources = [
        (d.name, d / "grades.csv")
        for d in sorted(root.glob("session*"))
        if (d / "grades.csv").exists()
    ]
    if not sources:
        print(f"{root} 下没有找到任何 session*/grades.csv", file=sys.stderr)
        return 1

    with httpx.Client() as client:
        courses = client.get(f"{base}/api/courses", headers=headers, timeout=60).json()
        students = client.get(f"{base}/api/students", headers=headers, timeout=60).json()
        archived = client.get(
            f"{base}/api/students", headers=headers, timeout=60, params={"archived": "true"}
        ).json()
        roster = {s["email"] for s in students} | {s["email"] for s in archived}

        # 已经有报课的 (邮箱, 课程)。重跑时它就是上一次自己写下的那批——
        # 于是"新建 0 条"这个结果不再依赖唯一约束去挡，而是压根不会去写。
        existing = {
            (e["student_email"], e["course_id"])
            for e in client.get(f"{base}/api/enrollments", headers=headers, timeout=60).json()
        }

        try:
            result = plan(
                sources, courses, roster, exclude=set(args.exclude), existing=existing
            )
        except UnknownCourse as exc:
            # 认不出课程就中止，不猜——猜错的记录看起来和对的一模一样。
            print(f"\n中止：{exc}", file=sys.stderr)
            return 1

        describe(result)

        if args.create_missing and result.missing_students:
            if not (args.region and args.level and args.source):
                print(
                    "\n--create-missing 需要同时给出 --region / --level / --source。"
                    "它们是必填枚举，而 CSV 里只有姓名与邮箱——不给就只能替你编一个。",
                    file=sys.stderr,
                )
                return 1
            _say(
                f"\n将为上面 {len(result.missing_students)} 人建档："
                f"区域 {args.region} · 基础 {args.level} · 来源 {args.source}"
            )

        if not args.apply:
            _say("\n（dry-run。加 --apply 才会写入。）")
            return 0

        if args.create_missing and result.missing_students:
            # 姓名只在这一步才读——能不碰就不碰（输出里也不打印它）。
            names: dict[str, str] = {}
            for _, path in sources:
                names.update(read_names(path))
            made = create_students(
                client,
                base,
                headers,
                [(e, names.get(e, "")) for e in result.missing_students],
                region=args.region,
                level=args.level,
                source=args.source,
            )
            _say(f"\n新建学员 {made} 人")

            # 名单变了，计划要重排——否则刚建的人这一轮还是拿不到报课，
            # 得再跑一次才行，而"跑两次才生效"是最容易被忘记的那种要求。
            students = client.get(f"{base}/api/students", headers=headers, timeout=60).json()
            archived = client.get(
                f"{base}/api/students", headers=headers, timeout=60, params={"archived": "true"}
            ).json()
            roster = {s["email"] for s in students} | {s["email"] for s in archived}
            result = plan(
                sources, courses, roster, exclude=set(args.exclude), existing=existing
            )
            _say(f"重排后将创建 {len(result.to_create)} 条报课")

        outcome = push(client, base, headers, result.to_create)

    _say(f"\n新建 {outcome.created} 条；已存在 {outcome.already_there} 条")
    if outcome.failed:
        _say(f"失败 {len(outcome.failed)} 条：")
        for line in outcome.failed:
            _say(f"  {line}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
