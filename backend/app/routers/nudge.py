"""催作业：从 `homework` 能力的状态判定里取"未交"名单，讲师标记已催/跳过。

不重新发明"谁该催"——直接复用 `homework.py` 的 `merge_states`/`state_of`，
两处各判一遍状态只会在某个边界上分叉。
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlmodel import Session, select

from app.db import get_session
from app.email_client import EmailSendError, send_email
from app.models import Course, CourseSession, Enrollment, HomeworkSubmission, NudgeEvent, Student
from app.routers.homework import MISSING, SUBMITTED, merge_states, state_of
from app.schemas import (
    NudgeCountRead,
    NudgeEventCreate,
    NudgeEventRead,
    NudgeListRead,
    NudgePersonRead,
    NudgeSendEmailRequest,
)

router = APIRouter(prefix="/api/nudge", tags=["nudge"])

# `count_nudge`（侧边栏徽标，全课程合计）用——按"最新一条 skipped/unskipped
# 事件决定当前是否跳过"，不是"曾经出现过 skipped"：后者会让取消跳过之后
# 这个人永久从徽标消失，讨论见 group-4 code review。跟 list_nudge 里
# `_is_currently_skipped` 是同一套判断，这里是 SQL 版本因为 count_nudge
# 不取整份 history。
_NOT_CURRENTLY_SKIPPED = text(
    """COALESCE(
        (SELECT ne.event_type FROM nudge_events ne
         WHERE ne.student_email = enrollments.student_email
           AND ne.course_id = enrollments.course_id
           AND ne.event_type IN ('skipped', 'unskipped')
         ORDER BY ne.created_at DESC
         LIMIT 1),
        'none'
    ) != 'skipped'"""
)

# 每人的完整催促历史，按时间倒序，一次带出——选中某人不再发一次请求。
_HISTORY_JSON = text(
    """(
        SELECT COALESCE(json_agg(json_build_object(
            'type', ne.event_type, 'channel', ne.channel, 'note', ne.note, 'at', ne.created_at
        ) ORDER BY ne.created_at DESC), '[]'::json)
        FROM nudge_events ne
        WHERE ne.student_email = enrollments.student_email
          AND ne.course_id = enrollments.course_id
    )"""
)


def _is_currently_skipped(history: list[dict]) -> bool:
    """`history` 已按时间倒序——第一条属于 skipped/unskipped 的事件决定当前状态。
    没有这类事件，或最新一条是 unskipped，都不算跳过。"""
    for item in history:
        if item["type"] in ("skipped", "unskipped"):
            return item["type"] == "skipped"
    return False


@router.get("", response_model=NudgeListRead)
def list_nudge(
    course: uuid.UUID = Query(),
    session: Session = Depends(get_session),
) -> NudgeListRead:
    """一门课的催作业名单：只含"未交"状态的人，逾期天数 + 完整催促历史一次带出。"""
    statement = (
        select(Enrollment, Student, CourseSession, HomeworkSubmission, _HISTORY_JSON)
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
    )

    people: dict[str, dict] = {}
    for enrollment, student, session_row, submission, history_json in session.exec(statement).all():
        found = people.setdefault(
            student.email,
            {"student": student, "pairs": [], "history": history_json},
        )
        state = SUBMITTED if submission is not None else state_of(session_row)
        session_date = session_row.local_date if session_row else None
        found["pairs"].append((state, session_date))

    result: list[NudgePersonRead] = []
    for email, found in people.items():
        states = [state for state, _ in found["pairs"]]
        if merge_states(states) != MISSING:
            continue
        missing_dates = [d for state, d in found["pairs"] if state == MISSING and d is not None]
        overdue_days = (date.today() - min(missing_dates)).days if missing_dates else 0
        student = found["student"]
        result.append(
            NudgePersonRead(
                student_email=email,
                name=student.name,
                wechat=student.wechat,
                course_id=course,
                overdue_days=overdue_days,
                history=[NudgeEventRead(**item) for item in found["history"]],
                skipped=_is_currently_skipped(found["history"]),
            )
        )

    result.sort(key=lambda p: (-p.overdue_days, p.name, p.student_email))

    # 已跳过的人现在就在 result 里（design.md 决定 4 修订）——不再需要单独
    # 查库，直接数。
    skipped_count = sum(1 for p in result if p.skipped)

    return NudgeListRead(items=result, skipped_count=skipped_count)


@router.get("/count", response_model=NudgeCountRead)
def count_nudge(session: Session = Depends(get_session)) -> NudgeCountRead:
    """全部课程合计的催作业名单人数。侧边栏徽标用——不带 `course`，跟按课程查的
    `list_nudge` 是两个不同的接口，同 `homework.count_homework` 的先例。

    不逐课程调 `list_nudge` 再相加——那是 N 次数据库往返。同一条 JOIN 去掉
    `course` 过滤，按（学员, 课程）分组各自判定，与 `list_nudge` 同一套逻辑。
    """
    statement = (
        select(Enrollment, Student, CourseSession, HomeworkSubmission)
        .join(Student, Student.email == Enrollment.student_email)
        .outerjoin(CourseSession, CourseSession.id == Enrollment.session_id)
        .outerjoin(
            HomeworkSubmission,
            (HomeworkSubmission.student_email == Enrollment.student_email)
            & (HomeworkSubmission.course_id == Enrollment.course_id),
        )
        .where(
            Enrollment.status != "withdrawn",
            Student.archived_at.is_(None),
            _NOT_CURRENTLY_SKIPPED,
        )
    )

    pairs: dict[tuple[str, uuid.UUID], list[str]] = {}
    for enrollment, _student, session_row, submission in session.exec(statement).all():
        key = (enrollment.student_email, enrollment.course_id)
        state = SUBMITTED if submission is not None else state_of(session_row)
        pairs.setdefault(key, []).append(state)

    total = sum(1 for states in pairs.values() if merge_states(states) == MISSING)
    return NudgeCountRead(total=total)


def _channel_for(student: Student) -> str:
    """微信已对齐走微信，否则走邮件——跟名单/详情面板"未对齐微信只能走邮件"
    的既有判断同一个依据，不接受调用方传入。"""
    return "wechat" if student.wechat else "email"


@router.post("/events", response_model=NudgeEventRead, status_code=201)
def create_nudge_event(
    payload: NudgeEventCreate,
    session: Session = Depends(get_session),
) -> NudgeEventRead:
    """讲师标记已催或跳过。"""
    student = session.get(Student, payload.student_email)
    if student is None:
        raise HTTPException(status_code=404, detail="没有这个学员")
    course = session.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="没有这门课")
    if payload.event_type not in ("nudged", "skipped", "unskipped"):
        raise HTTPException(status_code=422, detail="event_type 只能是 nudged、skipped 或 unskipped")

    channel = _channel_for(student) if payload.event_type == "nudged" else None
    row = NudgeEvent(
        student_email=payload.student_email,
        course_id=payload.course_id,
        event_type=payload.event_type,
        channel=channel,
        note=payload.note,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return NudgeEventRead(type=row.event_type, channel=row.channel, note=row.note, at=row.created_at)


@router.post("/send-email", response_model=NudgeEventRead, status_code=201)
def send_nudge_email(
    payload: NudgeSendEmailRequest,
    session: Session = Depends(get_session),
) -> NudgeEventRead:
    """真实发送一封催促邮件，成功后记一条 `channel=email` 的已催事件。

    渠道硬编码为 `"email"`——不走 `_channel_for()`：那个函数判的是"这个人平时
    该走哪个渠道"，跟"这次实际走了哪个渠道"是两件事（`nudge-email-send`
    design.md 决定 1/3）。发送失败时不落库，顺序是先发送、发送成功才写 DB。
    """
    student = session.get(Student, payload.student_email)
    if student is None:
        raise HTTPException(status_code=404, detail="没有这个学员")
    course = session.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="没有这门课")

    subject = f"《{course.name}》作业提醒"
    try:
        send_email(to=payload.student_email, subject=subject, body=payload.body)
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=f"发送失败：{exc}") from exc

    row = NudgeEvent(
        student_email=payload.student_email,
        course_id=payload.course_id,
        event_type="nudged",
        channel="email",
        note="",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return NudgeEventRead(type=row.event_type, channel=row.channel, note=row.note, at=row.created_at)
