"""作业：`ai-course/tools/homework-grader/session*/grades.csv` 的只读镜像。

写入只有一个入口——本地命令行工具发起的整批同步。页面上没有任何写入控件，
因为源文件由批改流程生成并由人维护：两边都能写就会分叉，而分叉之后没有哪一边
有资格当准。
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Course, CourseAlias, CourseSession, Enrollment, HomeworkSubmission, Student
from app.routers.courses import derive_session_state
from app.schemas import (
    HomeworkPersonRead,
    HomeworkUpsert,
    HomeworkUpsertResult,
    normalize_alias,
)

router = APIRouter(prefix="/api/homework", tags=["homework"])

# 四态。三态（稿子那版）不够：倒推进来的报课全是未定场次，而没有场次就没有
# 截止时间——把这些人算作「未交」等于制造一批催不了的催促目标。
SUBMITTED = "submitted"
NOT_OPEN = "not_open"
NO_SESSION = "no_session"
MISSING = "missing"

# 一人多条报课时，合并取**最宽容**的那个状态。
#
# 顺序就是这条规则本身：报了两场、其中一场还没上的人，不该因为另一场已经过了
# 就落进未交名单。写成"取第一条"的话，读接口没有 ORDER BY，"第一条"每次可能是
# 不同的行——同一个人时而未交、时而未开放，而错的那一边会**误催**。
_LENIENCY = [SUBMITTED, NOT_OPEN, NO_SESSION, MISSING]


def merge_states(states: list[str]) -> str:
    """同一个人的多条报课合成一个状态：取最宽容的那个。

    单独具名而不是内联进循环，是为了能单独测到——这条规则错了不会报错，
    只会让某个人被催或不被催，而那件事只有收件人看得见。
    """
    for candidate in _LENIENCY:
        if candidate in states:
            return candidate
    return MISSING  # pragma: no cover - states 非空时到不了


def state_of(session_row: CourseSession | None) -> str:
    """一条**没有提交**的报课记录对应的状态。

    「场次是否已结束」复用 `derive_session_state`——它处理了人工覆盖
    （比如把一场标成已取消）。另写一套日期比较必然在某个边界上分叉。
    """
    if session_row is None:
        return NO_SESSION
    state, _ = derive_session_state(session_row)
    return MISSING if state == "done" else NOT_OPEN


def _resolve_course(alias_raw: str, session: Session) -> Course:
    """别名 → 课程。查不到就整份拒绝。

    不做任何"从文件名猜"的兜底：源仓库里 `session3/` 与 `session4/` 的评分细则
    是对调的，`session4/` 整个目录是 S3 的空壳。目录名看着像可靠线索，实际不是。
    别名错了意味着整份文件都可能挂错课，所以这里拒绝的是整个请求，不是某一行。
    """
    alias = session.get(CourseAlias, normalize_alias(alias_raw))
    if alias is None:
        raise HTTPException(status_code=404, detail=f"没有别名为 {alias_raw!r} 的课程")
    course = session.get(Course, alias.course_id)
    if course is None:  # pragma: no cover - 外键保证
        raise HTTPException(status_code=404, detail=f"别名 {alias_raw!r} 指向的课程不存在")
    return course


@router.get("", response_model=list[HomeworkPersonRead])
def list_homework(
    course: uuid.UUID = Query(),
    session: Session = Depends(get_session),
) -> list[HomeworkPersonRead]:
    """一门课的作业名单。

    **一条 JOIN 取全。** 每次数据库往返实测 ≈ 61ms（Render → Supabase），
    而往返次数就是用户感知的延迟。这里能安全 JOIN 是因为每条报课至多对应
    一名学员、一场、一份作业，不会产生笛卡尔积。

    驱动表是**报课记录**，作业外连接上去——反过来以作业为驱动表会漏掉所有
    没交的人，也就是恰好漏掉这一页存在的理由。

    已归档学员与已退课的报课不进名单。这里的计数直接导向"催谁"，
    催一个已归档或已退课的人是错的。**与报课页有意不同**：那边的已报人数
    是历史事实的统计，不排除已归档学员。
    """
    rows = session.exec(
        select(Enrollment, Student, CourseSession, HomeworkSubmission)
        .join(Student, Student.email == Enrollment.student_email)
        .outerjoin(CourseSession, CourseSession.id == Enrollment.session_id)
        .outerjoin(
            HomeworkSubmission,
            (HomeworkSubmission.student_email == Enrollment.student_email)
            & (HomeworkSubmission.course_id == Enrollment.course_id),
        )
        .where(
            Enrollment.course_id == course,
            Enrollment.status != "withdrawn",
            Student.archived_at.is_(None),
        )
    ).all()

    # 按人去重（`enrollment` spec 的「作业按人计，不按报课记录计」）：
    # 重复来听是加深印象，不是重修——再催她交一遍作业是打扰。
    people: dict[str, dict] = {}
    for enrollment, student, session_row, submission in rows:
        found = people.setdefault(
            student.email,
            {"student": student, "submission": submission, "states": []},
        )
        if submission is not None:
            found["submission"] = submission
        found["states"].append(SUBMITTED if submission is not None else state_of(session_row))

    # 名次：按总分降序，并列时用邮箱打破——排序键打不破并列的话，两个同分的人
    # 谁在前会随堆顺序抖动，而堆顺序会因为任何一次写入而变。
    scored = sorted(
        ((p["submission"].total, email) for email, p in people.items() if p["submission"]),
        key=lambda pair: (-pair[0], pair[1]),
    )
    rank_by_email = {email: i + 1 for i, (_, email) in enumerate(scored)}

    result = []
    for email, found in people.items():
        student = found["student"]
        submission = found["submission"]
        result.append(
            HomeworkPersonRead(
                student_email=email,
                name=student.name,
                wechat=student.wechat,
                state=merge_states(found["states"]),
                submitted_at=submission.submitted_at if submission else None,
                total=submission.total if submission else None,
                scores=submission.scores if submission else [],
                highlight=submission.highlight if submission else "",
                improve=submission.improve if submission else "",
                reply_status=submission.reply_status if submission else "",
                source_ref=submission.source_ref if submission else "",
                rank=rank_by_email.get(email),
                rank_of=len(scored),
            )
        )
    # 名单本身也要有确定顺序：没有排序的话，编辑过的记录会跑到最后——
    # 位置记的是最后一次写入时间，而不是数据本身的任何属性。
    result.sort(key=lambda person: (person.name, person.student_email))
    return result


@router.put("", response_model=HomeworkUpsertResult)
def sync_homework(
    payload: HomeworkUpsert,
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> HomeworkUpsertResult:
    """整批同步一门课的作业成绩。**幂等**。

    `?dry_run=true` 算出完整的处置结果但一条都不写。两份跳过清单的判据是
    "谁在学员表""谁有该课的报课记录"——只有数据库知道，所以 dry-run 不能只在
    调用方本地做：那样它报不出实际执行会跳过谁，而"先看看会发生什么"正是
    dry-run 的全部意义。走的是**同一条**代码路径，只是最后不 commit。

    语义是「这批行的最新状态是这样」，按 `(学员, 课程)` upsert。
    重复送同一份文件不出错也不多出记录——csv 会被反复同步，让调用方去处理 409
    就等于要求它自己记住"上次送到哪了"。

    **覆盖式，不是同步式删除**：源文件里少了一行，库里那条仍然留着。
    csv 是会被裁剪、被重新生成的，把"这次没送来"读成"该删掉"会让一次误操作
    抹掉历史成绩，而权威副本的恢复要跨仓库。

    逐行处理、部分成功：18 行里有 1 行关联不上，不该让另外 17 行也进不来。
    """
    course = _resolve_course(payload.course_alias, session)

    emails = [row.student_email for row in payload.rows]
    # 三次成批查询而不是每行三次——行数是一整门课的人数（S1 是 18 行）。
    known = (
        set(session.exec(select(Student.email).where(Student.email.in_(emails))).all())
        if emails
        else set()
    )
    enrolled = (
        set(
            session.exec(
                select(Enrollment.student_email).where(
                    Enrollment.course_id == course.id,
                    Enrollment.student_email.in_(emails),
                )
            ).all()
        )
        if emails
        else set()
    )
    existing = {
        row.student_email: row
        for row in session.exec(
            select(HomeworkSubmission).where(HomeworkSubmission.course_id == course.id)
        ).all()
    }

    created = updated = 0
    no_student: list[str] = []
    no_enrollment: list[str] = []
    staged: set[str] = set()

    for row in payload.rows:
        if row.student_email not in known:
            # 学员都不在册，成绩挂不上去。留给"先建学员"那条处置路径。
            no_student.append(row.student_email)
            continue
        if row.student_email not in enrolled:
            # 成绩照写——它是有效数据。但名单来自报课记录，所以这个人在页面上
            # 一行都不会出现，不列出来就是静默消失。
            no_enrollment.append(row.student_email)

        fields = {
            "submitted_at": row.submitted_at,
            "total": row.total,
            "scores": [item.model_dump() for item in row.scores],
            "highlight": row.highlight,
            "improve": row.improve,
            "reply_status": row.reply_status,
            "source_ref": row.source_ref,
        }
        found = existing.get(row.student_email)
        # 同一封邮箱在一次请求里出现两次时，第二次是更新而不是新建。
        # 解析层已经去过重，但接口不该指望调用方替它守这条。
        if found is None and row.student_email not in staged:
            created += 1
        else:
            updated += 1
        staged.add(row.student_email)

        # dry-run **不往 session 里放任何东西**。
        #
        # 不用"照常 add、最后 rollback"：那样 dry-run 的正确性就取决于事务语义，
        # 而调用方的事务边界不归这里管——真发生过一次，回滚把调用方在本次事务里
        # 做的别的事一起撤销了。不写就是不写，比"写了再撤"少一整类假设。
        if dry_run:
            continue

        if found is None:
            record = HomeworkSubmission(
                student_email=row.student_email, course_id=course.id, **fields
            )
            session.add(record)
            existing[row.student_email] = record
        else:
            for key, value in fields.items():
                setattr(found, key, value)
            session.add(found)

    if not dry_run:
        session.commit()
    return HomeworkUpsertResult(
        created=created,
        updated=updated,
        skipped_no_student=no_student,
        skipped_no_enrollment=no_enrollment,
    )
