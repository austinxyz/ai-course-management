"""互动记录：`GET /api/interactions`、`GET /api/interactions/count`。

纯只读聚合视图——数据完全来自 `nudge` 能力已有的 `nudge_events` 表，不新增
写路径，不改表结构。不接受任何过滤参数：筛选（按学员、按时间范围）全部在
前端做，数据一次性整体取回（design.md 决定 1，跟 `students` 页 `enrollments`
的既有模式一致）。
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Course, NudgeEvent, Student
from app.schemas import InteractionCountRead, InteractionListRead, InteractionRead

router = APIRouter(prefix="/api/interactions", tags=["interactions"])


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
