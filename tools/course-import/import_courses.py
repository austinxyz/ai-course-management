"""把 courses.json 里的课程导入系统。

    python tools/course-import/import_courses.py            # dry-run
    python tools/course-import/import_courses.py --apply    # 写入

dry-run 是默认，也是唯一的防线：这个脚本打的是 BACKEND_URL 指向的库，最终就是生产。
dry-run 里后端只被读取，唯一的写入路径由 `--apply` 把守。

凭据来自环境，绝不进仓库：
    BACKEND_URL      如 https://<service>.onrender.com
    BACKEND_SECRET   X-Backend-Secret 头的值

匹配靠别名不靠课程名（见 planning.py）。脚本**不删除**任何东西 ——
库里有、清单里没有的场次只会被列出来，删除由人在界面上做。
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

from planning import plan

# Render 免费档 15 分钟无请求会休眠，唤醒要几十秒。默认超时会死在第一个请求上。
TIMEOUT = httpx.Timeout(60.0)


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"error: {name} is not set")
    return value


def _describe(action: dict[str, Any]) -> None:
    head = f"[{action['action']:<6}] {action['short']}  {action['fields']['name']}"
    if action["action"] == "update":
        head += f"   （现名：{action['current_name']}）"
    print(head)

    if action["aliases"]:
        print(f"           + 别名 {', '.join(action['aliases'])}")
    else:
        print("           别名已齐")

    for s in action["sessions"]:
        print(f"           + 场次 {s['local_date']} {s['local_time']} {s['tz']} · {s['teacher']}")
    if not action["sessions"]:
        print("           场次已齐")

    for s in action["extras"]:
        # 只报告。删除是决定，不交给批处理。
        print(
            f"           ! 库里多出一场 {s['local_date']} {s.get('local_time', '')} "
            f"{s.get('tz', '')} —— 清单里没有，脚本不动它"
        )


def _apply(client: httpx.Client, action: dict[str, Any]) -> list[str]:
    """执行一条动作，返回失败说明（空列表表示全部成功）。"""
    problems: list[str] = []

    if action["action"] == "create":
        resp = client.post("/api/courses", json=action["fields"])
        if resp.status_code != 201:
            return [f"建课失败 HTTP {resp.status_code}: {resp.text[:200]}"]
        course_id = resp.json()["id"]
    else:
        course_id = action["course_id"]
        resp = client.patch(f"/api/courses/{course_id}", json=action["fields"])
        if resp.status_code != 200:
            return [f"更新失败 HTTP {resp.status_code}: {resp.text[:200]}"]

    for raw in action["aliases"]:
        r = client.post(f"/api/courses/{course_id}/aliases", json={"raw": raw})
        if r.status_code == 409:
            # 别名被别的课占着 —— 说清是谁占的，别把它当成"已经加过了"。
            problems.append(f"别名 {raw} 冲突：{r.json().get('detail', '')}")
        elif r.status_code != 201:
            problems.append(f"别名 {raw} 失败 HTTP {r.status_code}")

    for s in action["sessions"]:
        r = client.post(f"/api/courses/{course_id}/sessions", json=s)
        if r.status_code != 201:
            problems.append(f"场次 {s['local_date']} 失败 HTTP {r.status_code}: {r.text[:160]}")

    return problems


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        # 每一行输出都含中文；默认 Windows 控制台是 cp1252，第一句 print 就会炸。
        stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="真的写入；省略即 dry-run")
    parser.add_argument(
        "--file",
        default=str(Path(__file__).parent / "courses.json"),
        help="课程清单，默认同目录的 courses.json",
    )
    args = parser.parse_args()

    backend_url = _require_env("BACKEND_URL").rstrip("/")
    backend_secret = _require_env("BACKEND_SECRET")
    data = json.loads(Path(args.file).read_text(encoding="utf-8"))

    headers = {"X-Backend-Secret": backend_secret}
    with httpx.Client(base_url=backend_url, headers=headers, timeout=TIMEOUT) as client:
        resp = client.get("/api/courses")
        resp.raise_for_status()
        existing = resp.json()

        actions = plan(data, existing)

        print(f"清单 {len(data['courses'])} 门课；库里现有 {len(existing)} 门")
        print(f"目标 {backend_url}   模式 {'APPLY' if args.apply else 'DRY-RUN'}\n")
        for action in actions:
            _describe(action)
        print()

        if not args.apply:
            creates = sum(1 for a in actions if a["action"] == "create")
            updates = len(actions) - creates
            sessions = sum(len(a["sessions"]) for a in actions)
            aliases = sum(len(a["aliases"]) for a in actions)
            print(
                f"将新建 {creates} 门、更新 {updates} 门、"
                f"加 {aliases} 条别名、加 {sessions} 场（未写入任何数据）"
            )
            return 0

        failures: list[str] = []
        for action in actions:
            problems = _apply(client, action)
            for problem in problems:
                print(f"  !! {action['short']}: {problem}")
            failures.extend(problems)

        after = client.get("/api/courses").json()
        print(f"\n课程数 {len(existing)} -> {len(after)}；失败 {len(failures)} 项")
        return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
