import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Course, CourseAlias, CourseSession
from app.schemas import (
    AliasCreate,
    AliasRead,
    CourseCreate,
    CourseRead,
    CourseUpdate,
    SessionRead,
    normalize_alias,
)

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


def _load(course_id: uuid.UUID, session: Session) -> Course:
    course = session.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="course not found")
    return course


def _read_one(course: Course, session: Session) -> CourseRead:
    aliases = session.exec(
        select(CourseAlias).where(CourseAlias.course_id == course.id).order_by(CourseAlias.raw)
    ).all()
    sessions = session.exec(
        select(CourseSession)
        .where(CourseSession.course_id == course.id)
        .order_by(CourseSession.local_date, CourseSession.local_time, CourseSession.id)
    ).all()
    return _to_course_read(course, list(aliases), list(sessions))


@router.post("", response_model=CourseRead, status_code=201)
def create_course(body: CourseCreate, session: Session = Depends(get_session)):
    """课程名重复是允许的——匹配靠别名，课程名是给人看的。"""
    course = Course(**body.model_dump())
    session.add(course)
    session.commit()
    session.refresh(course)
    return _read_one(course, session)


@router.patch("/{course_id}", response_model=CourseRead)
def update_course(
    course_id: uuid.UUID, body: CourseUpdate, session: Session = Depends(get_session)
):
    """只写请求真的提到的字段。

    没有删除课程的端点，下线走这里的 `offline` —— 课程是报课、作业、催作业共用的口径，
    删掉会让引用它的记录失去归属。
    """
    course = _load(course_id, session)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    session.add(course)
    session.commit()
    session.refresh(course)
    return _read_one(course, session)


def _existing_alias(session: Session, key: str) -> CourseAlias | None:
    """预查占用者。单独一个函数，好让测试把它打掉、走到撞主键那条分支上。"""
    return session.get(CourseAlias, key)


def _alias_taken(session: Session, key: str) -> HTTPException:
    existing = _existing_alias(session, key)
    shown = existing.raw if existing is not None else key
    owner = session.get(Course, existing.course_id) if existing is not None else None
    detail = (
        f"别名 {shown} 已属于课程「{owner.name}」"
        if owner is not None
        else f"别名 {shown} 已被占用"
    )
    return HTTPException(status_code=409, detail=detail)


@router.post("/{course_id}/aliases", response_model=CourseRead, status_code=201)
def add_alias(
    course_id: uuid.UUID, body: AliasCreate, session: Session = Depends(get_session)
):
    """加一个平台别名。

    冲突返回 409 并说出是谁占着，界面才能把人引导过去。已存在时**不覆盖** `raw`：
    先到先得，后来者的大小写不该改写别人已经确认过的写法。
    """
    course = _load(course_id, session)
    key = normalize_alias(body.raw)

    if _existing_alias(session, key) is not None:
        raise _alias_taken(session, key)

    session.add(CourseAlias(alias=key, raw=body.raw, course_id=course.id))
    try:
        session.commit()
    except IntegrityError:
        # 两个请求同时加同一别名时都能通过上面的预查，其中一个在这里撞主键。
        # 未捕获就是 500，而语义上它仍然是"这个别名已被占用"。
        session.rollback()
        raise _alias_taken(session, key) from None
    return _read_one(course, session)


@router.delete("/{course_id}/aliases/{raw}", response_model=CourseRead)
def remove_alias(
    course_id: uuid.UUID, raw: str, session: Session = Depends(get_session)
):
    course = _load(course_id, session)
    alias = session.get(CourseAlias, normalize_alias(raw))
    # 归属不符也当作找不到：路径里带着 course_id，B 课的请求不该删掉 A 课的别名。
    # 返回 200 会让"什么都没发生"和"删成功"长得一模一样。
    if alias is None or alias.course_id != course.id:
        raise HTTPException(status_code=404, detail="alias not found on this course")
    session.delete(alias)
    session.commit()
    return _read_one(course, session)
