"""把 `grades.csv` 同步进学员管理系统。

    python tools/homework-sync/sync.py --course S1 <path/to/grades.csv>
    python tools/homework-sync/sync.py --course S1 <path> --apply    # 唯一会写的路径

默认只读（dry-run），与 `tools/enrollment-backfill` 同一约定：手滑不会写库。

**课程必须显式给。** 不从路径推断——源仓库里 `session3/` 与 `session4/` 的
`references/rubric.md` 是对调的，`session4/` 整个目录是 S3 的空壳。
目录名看着像可靠线索，实际上已经错了。

同步是幂等的：同一份文件跑几遍结果都一样，重跑不会多出记录。
也是**覆盖式**的——源文件里删掉一行，库里那条仍在。
"""

import argparse
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from parsing import BadHeader, parse  # noqa: E402

# Render 免费档冷启动要几十秒，所以给得比一般接口宽。但必须有——
# 不设的话请求会一直挂着，看起来像"卡住了"而不是"后端没醒"。
TIMEOUT = 60.0


def _say(line: str = "") -> None:
    """打一行，且不因控制台编码而崩。

    Windows 控制台默认 cp1252，而这个脚本的输出整个是中文——直接 print 会在
    第一行就抛 UnicodeEncodeError，把一次只读的 dry-run 变成崩溃，
    而崩溃的样子跟"数据有问题"很像。

    写进 stdout 的 buffer 并显式用 UTF-8 编码，绕开控制台自己的编码设定。
    `sys.stdout.reconfigure()` 在这里不行：它对已被重定向的流不生效。
    """
    stream = getattr(sys.stdout, "buffer", None)
    if stream is None:
        print(line)
        return
    stream.write((line + "\n").encode("utf-8"))
    stream.flush()


def _emails(values: list[str], names: dict[str, str]) -> None:
    for email in values:
        who = names.get(email)
        _say(f"    {email}" + (f"（{who}）" if who else ""))


def describe(result, course: str, path: Path) -> None:
    """解析结果的报告。dry-run 与 --apply 都先打这一段。"""
    _say(f"{course}  ←  {path}")
    _say(f"  {len(result.rows)} 行")

    if result.superseded:
        _say(f"\n  同一人重复提交，取较晚的一次，丢弃 {len(result.superseded)} 行：")
        for ref in result.superseded:
            _say(f"    {ref}")

    if result.rows_without_email:
        _say(f"\n  ⚠ 没有邮箱、无法关联的行 {len(result.rows_without_email)} 条：")
        for ref in result.rows_without_email:
            _say(f"    {ref}")


def report_outcome(body: dict, names: dict[str, str], *, dry_run: bool = False) -> None:
    """接口返回的处置结果。

    两份跳过清单**分开列**：处置相反——一类要先建学员，另一类要补报课记录。
    合成一句"有 N 个人有问题"就无从下手。

    dry-run 与真跑打**同一段**报告，只是措辞是"将"。两条渲染路径会长出差异，
    而差异恰好出现在"我以为我预演过了"这件事上。
    """
    verb = "将新建" if dry_run else "新建"
    _say(f"\n  {verb} {body['created']} 条 · {'将更新' if dry_run else '更新'} {body['updated']} 条")

    no_student = body.get("skipped_no_student") or []
    if no_student:
        _say(f"\n  ⚠ 不在学员表里，成绩**未写入**，先建学员（{len(no_student)} 人）：")
        _emails(no_student, names)

    no_enrollment = body.get("skipped_no_enrollment") or []
    if no_enrollment:
        _say(
            f"\n  ⚠ 在学员表里但这门课没有报课记录（{len(no_enrollment)} 人）。"
            "\n    成绩**已写入**，但名单来自报课记录，所以他们在页面上不会出现。"
            "\n    先补报课记录，再回来看计数："
        )
        _emails(no_enrollment, names)

    if dry_run:
        _say("\n  dry-run，什么都没写。加 --apply 执行。")


def push(
    client,
    base: str,
    headers: dict[str, str],
    course: str,
    rows: list[dict],
    *,
    dry_run: bool = False,
) -> dict:
    """发出去。返回接口的响应体。

    dry-run 也走这条路，只是带上 `?dry_run=true`：服务端算完整个处置结果但不落库。
    两份跳过清单的判据是"谁在学员表""谁有该课的报课记录"——只有数据库知道，
    所以 dry-run 不能只在本地解析，那样它报不出实际会跳过谁。

    `raise_for_status` 不能省：httpx 不会因 4xx/404 抛异常，不显式检查的话
    脚本会"成功地什么都没做"——每个请求 404，报告照样打印一切正常。
    """
    payload = {
        "course_alias": course,
        "rows": [
            {**row, "submitted_at": row["submitted_at"].isoformat()} for row in rows
        ],
    }
    url = f"{base}/api/homework" + ("?dry_run=true" if dry_run else "")
    resp = client.put(url, json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def main(
    argv: list[str] | None = None,
    *,
    client=None,
    base: str | None = None,
    headers: dict[str, str] | None = None,
) -> int:
    parser = argparse.ArgumentParser(description="把 grades.csv 同步进学员管理系统")
    # 必填，且没有"从路径猜"的兜底。别名错了整份文件都会挂错课。
    parser.add_argument("--course", required=True, help="课程别名，例如 S1（走 course_aliases 解析）")
    parser.add_argument("path", help="grades.csv 的路径")
    parser.add_argument("--apply", action="store_true", help="真的写入。不加就是 dry-run")
    # 显式排除，而不是指望某人"碰巧不在学员表里"。
    # 讲师本人的测试提交就在 session1/grades.csv 里（两行，姓名还不一样）；
    # 它们现在没进库只是因为他不在学员表里——他哪天被加进名单，
    # 那两条测试提交就会静默变成真实成绩。
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="EMAIL",
        help="不算作业的邮箱，可重复。用于讲师自己的测试提交",
    )
    args = parser.parse_args(argv)

    path = Path(args.path)
    if not path.is_file():
        _say(f"找不到文件：{path}")
        return 1

    # 报告里的文件名取「上一级目录/文件名」，也就是 source_ref 的前缀。
    # 只是给人看的定位信息，不参与课程判断。
    source = f"{path.parent.name}/{path.name}"
    try:
        result = parse(path.read_text(encoding="utf-8-sig"), source=source)
    except BadHeader as exc:
        _say(f"表头不对：{exc}")
        return 1
    except ValueError as exc:
        _say(f"解析失败：{exc}")
        return 1

    excluded = {e.strip().lower() for e in args.exclude if e.strip()}
    dropped = [r for r in result.rows if r["student_email"] in excluded]
    rows = [r for r in result.rows if r["student_email"] not in excluded]

    describe(result, args.course, path)

    if dropped:
        # 说出来。悄悄少几行与"数据本来就没有"分不出来。
        _say(f"\n  排除 {len(dropped)} 行——显式指定不算作业：")
        for row in dropped:
            _say(f"    {row['student_email']}（{result.names.get(row['student_email'], '?')}）")

    if client is None:  # pragma: no cover - 真实运行路径
        client = httpx.Client()
    if base is None:  # pragma: no cover
        base = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")
    if headers is None:  # pragma: no cover
        secret = os.environ.get("BACKEND_SECRET")
        if not secret:
            _say("BACKEND_SECRET 没设，写不进去。")
            return 1
        headers = {"X-Backend-Secret": secret}

    try:
        body = push(client, base, headers, args.course, rows, dry_run=not args.apply)
    except httpx.TimeoutException:
        _say(f"\n  请求超时（{TIMEOUT:.0f}s）。后端可能在冷启动，稍等再跑一次。")
        return 1
    except httpx.HTTPStatusError as exc:
        detail = ""
        try:
            detail = str(exc.response.json().get("detail", ""))
        except Exception:
            detail = exc.response.text
        _say(f"\n  后端拒绝了：HTTP {exc.response.status_code} {detail}")
        return 1
    except httpx.HTTPError as exc:
        _say(f"\n  请求失败：{exc}")
        return 1

    report_outcome(body, result.names, dry_run=not args.apply)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
