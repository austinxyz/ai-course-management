import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

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
    SessionCreate,
    SessionRead,
    SessionUpdate,
    normalize_alias,
)

PACIFIC = ZoneInfo("America/Los_Angeles")


def utcnow() -> datetime:
    """现在。单独一个函数，好让测试注入"UTC 已跨日、美西未跨日"那一刻。"""
    return datetime.now(UTC)


def today_pt() -> date:
    """美西的今天。

    服务器在 Render 上跑 UTC。按服务器日期判断状态时，UTC 已跨日而美西还没跨日的
    那几个小时里，今晚的课会被提前标成「已上」。
    """
    return utcnow().astimezone(PACIFIC).date()


def _derive_state(row: CourseSession) -> tuple[str, bool]:
    """状态：人工覆盖优先，否则跟随日期。

    返回 (状态, 是否人工覆盖) —— 界面靠第二个值决定显示「跟随日期」还是
    「恢复跟随日期」。这两种情况都不是"某个状态"，所以一个 state 列表达不了。
    """
    if row.state_override is not None:
        return row.state_override, True
    return ("done" if row.local_date < today_pt() else "pending"), False

router = APIRouter(prefix="/api/courses", tags=["courses"])


def _starts_at(row: CourseSession) -> datetime:
    """墙上时间 + 时区名 → 绝对时刻，读取时算。

    存下来就冻结了当时的时区规则，而规则会改；墙上时间才是讲师的意图，
    时刻是派生物。zoneinfo 处理夏令时，这里不出现任何偏移小时数。
    """
    return datetime.combine(row.local_date, row.local_time, tzinfo=ZoneInfo(row.tz))


def _to_session_read(row: CourseSession) -> SessionRead:
    state, is_override = _derive_state(row)
    return SessionRead(
        id=row.id,
        starts_at=_starts_at(row),
        state=state,
        state_is_override=is_override,
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
        duration_minutes=course.duration_minutes,
        homework_title=course.homework_title,
        offline=course.offline,
        default_tz=course.default_tz,
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
    courses = session.exec(select(Course)).all()
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
        for c in sorted(courses, key=lambda c: _list_order(c, sessions))
    ]


def _newest_first(iso_date: str) -> str:
    """把 ISO 日期变成"越新越小"的字符串，好让升序排序得出倒序日期。

    为什么不用 `sorted(..., reverse=True)`：排序键还有名称与 id 兜底，整体反转
    会把它们也反过来，同日两门课的顺序就与"名称升序"这条说法相反。
    非数字字符原样保留，所以 `2026-07-26` 里的分隔符不受影响。
    """
    return "".join(chr(ord("9") - int(ch)) if ch.isdigit() else ch for ch in iso_date)


def _list_order(course: Course, sessions: dict[uuid.UUID, list[CourseSession]]):
    """课程列表的排序键：最近开课的在前，还没排课的更在前。

    讲师找的是"最近在上的那门"，课程名的字典序对他没有意义。
    排序键取**最早**那一场——"这门课什么时候开的"指第一场，不是最后一场。

    第一段是分组位而不是一个"很大的哨兵日期"：哨兵值总有一天会与真实数据撞上，
    而且一旦泄漏到别处就极难查。名称与 id 兜底，让同日的两门课顺序不随写入抖动。

    排序放在这里而不是 SQL：键是子集合的聚合值，而场次已经为了避免 N+1 取回内存了，
    课程又只有个位数。课程上百时再推到 SQL，届时与 N+1 一起处理。
    """
    dates = [s.local_date for s in sessions.get(course.id, [])]
    if not dates:
        return (0, "", course.name, str(course.id))
    return (1, _newest_first(min(dates).isoformat()), course.name, str(course.id))


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


def _load_session(
    course: Course, session_id: uuid.UUID, session: Session
) -> CourseSession:
    row = session.get(CourseSession, session_id)
    # 归属不符按找不到处理：路径里带着 course_id，B 课的请求不该改到 A 课的场次。
    if row is None or row.course_id != course.id:
        raise HTTPException(status_code=404, detail="session not found on this course")
    return row


@router.get("/teachers", response_model=list[str])
def list_teachers(session: Session = Depends(get_session)):
    """讲师选项 = 已有场次上出现过的名字去重。

    讲师不是实体（见 design）：就讲师本人与合作伙伴几个，一张表换不来什么。
    界面拿这个列表当选项，并允许当场录入新名字。
    """
    rows = session.exec(select(CourseSession.teacher).distinct()).all()
    return sorted(rows)


@router.post("/{course_id}/sessions", response_model=CourseRead, status_code=201)
def add_session(
    course_id: uuid.UUID, body: SessionCreate, session: Session = Depends(get_session)
):
    course = _load(course_id, session)
    fields = body.model_dump()
    # 缺省取课程的默认时区：讲师给这门课设过"通常按哪个时区排"，
    # 新增时就不该再退回某个写死的值。
    fields["tz"] = fields.get("tz") or course.default_tz
    session.add(CourseSession(course_id=course.id, **fields))
    session.commit()
    return _read_one(course, session)


@router.patch("/{course_id}/sessions/{session_id}", response_model=CourseRead)
def update_session(
    course_id: uuid.UUID,
    session_id: uuid.UUID,
    body: SessionUpdate,
    session: Session = Depends(get_session),
):
    course = _load(course_id, session)
    row = _load_session(course, session_id, session)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    session.add(row)
    session.commit()
    return _read_one(course, session)


@router.post(
    "/{course_id}/sessions/{session_id}/follow-date", response_model=CourseRead
)
def follow_date(
    course_id: uuid.UUID, session_id: uuid.UUID, session: Session = Depends(get_session)
):
    """清除人工覆盖，状态回到跟随日期。

    是个动作而不是"把 state_override 设为 null"的 PATCH：更新请求里的显式 null
    被拒（它与"没提到这个字段"撞同一个值），所以清除需要自己的入口。
    """
    course = _load(course_id, session)
    row = _load_session(course, session_id, session)
    row.state_override = None
    session.add(row)
    session.commit()
    return _read_one(course, session)


@router.delete("/{course_id}/sessions/{session_id}", response_model=CourseRead)
def remove_session(
    course_id: uuid.UUID, session_id: uuid.UUID, session: Session = Depends(get_session)
):
    """删一场。

    本 change 没有报课表，所以删除没有连带影响。报课能力落地时**必须**补上
    "删除已有报课的场次要被拒绝"，否则报课记录会指向不存在的场次。
    """
    course = _load(course_id, session)
    row = _load_session(course, session_id, session)
    session.delete(row)
    session.commit()
    return _read_one(course, session)
