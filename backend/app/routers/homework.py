"""作业：`ai-course/tools/homework-grader/session*/grades.csv` 的只读镜像。

写入只有一个入口——本地命令行工具发起的整批同步。页面上没有任何写入控件，
因为源文件由批改流程生成并由人维护：两边都能写就会分叉，而分叉之后没有哪一边
有资格当准。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Course, CourseAlias, Enrollment, HomeworkSubmission, Student
from app.schemas import HomeworkUpsert, HomeworkUpsertResult, normalize_alias

router = APIRouter(prefix="/api/homework", tags=["homework"])


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


@router.put("", response_model=HomeworkUpsertResult)
def sync_homework(
    payload: HomeworkUpsert,
    session: Session = Depends(get_session),
) -> HomeworkUpsertResult:
    """整批同步一门课的作业成绩。**幂等**。

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
        if found is None:
            record = HomeworkSubmission(
                student_email=row.student_email, course_id=course.id, **fields
            )
            session.add(record)
            existing[row.student_email] = record
            created += 1
        else:
            for key, value in fields.items():
                setattr(found, key, value)
            session.add(found)
            updated += 1

    session.commit()
    return HomeworkUpsertResult(
        created=created,
        updated=updated,
        skipped_no_student=no_student,
        skipped_no_enrollment=no_enrollment,
    )
