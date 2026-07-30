import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Course, CourseAlias, CourseSession
from app.schemas import AliasRead, CourseRead, SessionRead

router = APIRouter(prefix="/api/courses", tags=["courses"])


def _to_session_read(row: CourseSession) -> SessionRead:
    return SessionRead(
        id=row.id,
        local_date=row.local_date,
        local_time=row.local_time,
        tz=row.tz,
        teacher=row.teacher,
        note=row.note,
    )


def _to_course_read(
    course: Course,
    aliases: list[CourseAlias],
    sessions: list[CourseSession],
) -> CourseRead:
    return CourseRead(
        id=course.id,
        name=course.name,
        short=course.short,
        tagline=course.tagline,
        intro=course.intro,
        hours=course.hours,
        homework_title=course.homework_title,
        offline=course.offline,
        aliases=[AliasRead(raw=a.raw) for a in aliases],
        sessions=[_to_session_read(s) for s in sessions],
    )


@router.get("", response_model=list[CourseRead])
def list_courses(session: Session = Depends(get_session)):
    """课程、别名与场次一次取全。

    课程页要同时显示三者；分成三个请求只会让页面分三次抖动，而课程数量是个位数,
    一次取全比省几行 join 更值。别名与场次在内存里按 course_id 归拢，
    避免 N+1：课程数少不代表可以每门课再发两条查询。
    """
    courses = session.exec(select(Course).order_by(Course.name, Course.id)).all()
    if not courses:
        return []

    aliases: dict[uuid.UUID, list[CourseAlias]] = {}
    for alias in session.exec(select(CourseAlias).order_by(CourseAlias.raw)).all():
        aliases.setdefault(alias.course_id, []).append(alias)

    sessions: dict[uuid.UUID, list[CourseSession]] = {}
    # 场次按日期升序：没有 ORDER BY 时 Postgres 给的是堆顺序，而 UPDATE 会把改过的行
    # 写到堆尾——改一场的时间就会让它跳到列表末尾。
    ordered = select(CourseSession).order_by(
        CourseSession.local_date, CourseSession.local_time, CourseSession.id
    )
    for row in session.exec(ordered).all():
        sessions.setdefault(row.course_id, []).append(row)

    return [
        _to_course_read(c, aliases.get(c.id, []), sessions.get(c.id, []))
        for c in courses
    ]
