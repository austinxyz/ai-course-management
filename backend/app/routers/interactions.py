"""互动记录：`GET /api/interactions`、`GET /api/interactions/count`、
`POST /api/interactions`。

数据完全来自 `nudge` 能力已有的 `nudge_events` 表，不改表结构。读接口不接受
任何过滤参数：筛选（按学员、按时间范围）全部在前端做，数据一次性整体取回
（design.md 决定 1，跟 `students` 页 `enrollments` 的既有模式一致）。写接口
（手动录入 + 参与度信号）复用同一张表，用 `channel` 列表达"手动录入的类型"
或"参与度信号的具体信号"——不是字面意义的渠道；`event_type` 按请求体的
`kind` 固定写 `manual`/`participation`（`interactions-design-alignment`
design.md 决定 1、2、5）。
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Course, Enrollment, NudgeEvent, Student
from app.schemas import (
    InteractionCountRead,
    InteractionCreate,
    InteractionListRead,
    InteractionRead,
    ManualInteractionCreate,
)

router = APIRouter(prefix="/api/interactions", tags=["interactions"])


def _latest_active_course(session: Session, student_email: str) -> Course | None:
    """该学员未退课报课记录里 `enrolled_at` 最大的一条对应的课程。查不到
    返回 `None`——调用方据此拒绝写入（design.md 决定 4）。"""
    statement = (
        select(Enrollment)
        .where(Enrollment.student_email == student_email, Enrollment.status != "withdrawn")
        .order_by(Enrollment.enrolled_at.desc())
    )
    enrollment = session.exec(statement).first()
    if enrollment is None:
        return None
    return session.get(Course, enrollment.course_id)


@router.get("", response_model=InteractionListRead)
def list_interactions(session: Session = Depends(get_session)) -> InteractionListRead:
    """全部互动记录，JOIN 出学员姓名与课程名，按时间倒序。不过滤 `event_type`——
    已催/跳过/取消跳过三类都出现在结果里。`id` 是并列时的打破并列排序——同一
    时刻的多条事件需要一个确定的相对顺序，否则同一份数据两次查询可能返回
    不同的行序（`CLAUDE.md` 已记录的坑：读接口必须有能打破并列的 ORDER BY）。"""
    statement = (
        select(NudgeEvent, Student, Course)
        .join(Student, Student.email == NudgeEvent.student_email)
        .join(Course, Course.id == NudgeEvent.course_id)
        .order_by(NudgeEvent.created_at.desc(), NudgeEvent.id.desc())
    )
    items = [
        InteractionRead(
            student_email=event.student_email,
            student_name=student.name,
            course_id=event.course_id,
            course_name=course.name,
            event_type=event.event_type,
            channel=event.channel,
            note=event.note,
            at=event.created_at,
        )
        for event, student, course in session.exec(statement).all()
    ]
    return InteractionListRead(items=items)


@router.get("/count", response_model=InteractionCountRead)
def count_interactions(session: Session = Depends(get_session)) -> InteractionCountRead:
    """最近 7 天互动条数——侧边栏徽标用，固定窗口，不接受参数。"""
    since = datetime.now(UTC) - timedelta(days=7)
    statement = select(func.count()).select_from(NudgeEvent).where(NudgeEvent.created_at >= since)
    total = session.exec(statement).one()
    return InteractionCountRead(total=total)


@router.post("", response_model=InteractionRead, status_code=201)
def create_interaction(
    payload: InteractionCreate,
    session: Session = Depends(get_session),
) -> InteractionRead:
    """手动录入一条互动记录，或打一条参与度信号——由请求体的 `kind` 区分。
    时间是服务器接收请求时的当前时刻，不接受调用方指定；课程由服务端自动
    推导，不接受调用方指定；`event_type` 按 `kind` 固定写死，不接受调用方
    指定（design.md 决定 1、4、5）。"""
    student = session.get(Student, payload.student_email)
    if student is None:
        raise HTTPException(status_code=404, detail="没有这名学员")
    course = _latest_active_course(session, payload.student_email)
    if course is None:
        raise HTTPException(status_code=422, detail="这名学员没有有效报课，没法记录互动")

    if isinstance(payload, ManualInteractionCreate):
        event_type = "manual"
        channel = payload.type
        note = payload.note
    else:
        event_type = "participation"
        channel = payload.signal
        note = ""

    event = NudgeEvent(
        student_email=payload.student_email,
        course_id=course.id,
        event_type=event_type,
        channel=channel,
        note=note,
        created_at=datetime.now(UTC),
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return InteractionRead(
        student_email=event.student_email,
        student_name=student.name,
        course_id=event.course_id,
        course_name=course.name,
        event_type=event.event_type,
        channel=event.channel,
        note=event.note,
        at=event.created_at,
    )
