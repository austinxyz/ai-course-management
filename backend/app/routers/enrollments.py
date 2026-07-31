"""报课：把学员挂到课程，可以指明上哪一场。"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Course, CourseSession, Enrollment
from app.routers.courses import derive_session_state
from app.schemas import EnrollmentCreate, EnrollmentRead, EnrollmentUpdate

router = APIRouter(prefix="/api/enrollments", tags=["enrollments"])


def derive_enrollment_state(row: Enrollment, session_row: CourseSession | None) -> str:
    """报课的显示状态。

    只有「退课」是存下来的；其余由所属场次推出，因为没有人会在每次课后回来把
    十几条记录挨个改成「已完成」——存下来的状态会腐烂，派生的不会。

    场次的状态本身也是派生的（`state_override` 为空即跟随日期，"今天"取美西）。
    这里**复用**它而不是自己再算一遍日期：两处各算一遍，必然在某个边界上分叉。

    场次已取消时算「报名」而不是「已完成」——课没上成，人还欠一场。
    """
    if row.status == "withdrawn":
        return "withdrawn"
    if session_row is None:
        return "enrolled"
    state, _ = derive_session_state(session_row)
    return "completed" if state == "done" else "enrolled"


def _to_read(
    row: Enrollment,
    course: Course,
    session_row: CourseSession | None,
) -> EnrollmentRead:
    return EnrollmentRead(
        id=row.id,
        student_email=row.student_email,
        course_id=row.course_id,
        course_name=course.name,
        session_id=row.session_id,
        session_date=session_row.local_date if session_row else None,
        enrolled_at=row.enrolled_at,
        state=derive_enrollment_state(row, session_row),
        source=row.source,
        note=row.note,
    )


@router.get("", response_model=list[EnrollmentRead])
def list_enrollments(
    student: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[EnrollmentRead]:
    """报课列表，可按学员筛选。

    课程与场次一次取回内存归拢，而不是逐条查——逐条查是 N+1，而一个学员
    的报课条数虽小，课程页那边会按整库聚合。
    """
    statement = select(Enrollment)
    if student is not None:
        statement = statement.where(Enrollment.student_email == student)
    rows = session.exec(statement).all()
    if not rows:
        return []

    courses = {c.id: c for c in session.exec(select(Course)).all()}
    sessions: dict[uuid.UUID, CourseSession] = {
        s.id: s for s in session.exec(select(CourseSession)).all()
    }
    return [
        _to_read(row, courses[row.course_id], sessions.get(row.session_id) if row.session_id else None)
        for row in rows
    ]


def _require_session_of(course: Course, session_id: uuid.UUID | None, session: Session) -> None:
    """场次必须属于这门课。

    状态是从"所属场次"派生的，所以挂错课的场次会让这条报课按一个毫不相干的日期
    显示已完成。数据库层表达不了这条（外键只能指向 course_sessions.id，
    管不到它的 course_id），所以只能在边界上挡。
    """
    if session_id is None:
        return
    row = session.get(CourseSession, session_id)
    if row is None or row.course_id != course.id:
        raise HTTPException(status_code=422, detail="这一场不属于这门课")


def _load(enrollment_id: uuid.UUID, session: Session) -> Enrollment:
    row = session.get(Enrollment, enrollment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="没有这条报课记录")
    return row


def _load_course(course_id: uuid.UUID, session: Session) -> Course:
    course = session.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="没有这门课")
    return course


def _read_one(row: Enrollment, session: Session) -> EnrollmentRead:
    course = session.get(Course, row.course_id)
    session_row = session.get(CourseSession, row.session_id) if row.session_id else None
    assert course is not None  # 外键保证
    return _to_read(row, course, session_row)


@router.post("", response_model=EnrollmentRead, status_code=201)
def create_enrollment(
    payload: EnrollmentCreate,
    session: Session = Depends(get_session),
) -> EnrollmentRead:
    """补录一条报课。

    重复（同一学员+课程+场次，或同一学员+课程的第二条未定场次）由数据库的两条
    唯一索引挡住；这里把 IntegrityError 翻译成 409，让调用方看得懂。
    """
    course = _load_course(payload.course_id, session)
    if course.offline:
        raise HTTPException(status_code=409, detail="这门课已下线，不能新建报课")
    _require_session_of(course, payload.session_id, session)

    row = Enrollment(
        student_email=payload.student_email,
        course_id=payload.course_id,
        session_id=payload.session_id,
        enrolled_at=payload.enrolled_at,
        note=payload.note,
        source=payload.source,
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="这条报课已经存在") from None
    session.refresh(row)
    return _read_one(row, session)


@router.patch("/{enrollment_id}", response_model=EnrollmentRead)
def update_enrollment(
    enrollment_id: uuid.UUID,
    payload: EnrollmentUpdate,
    session: Session = Depends(get_session),
) -> EnrollmentRead:
    """改一条报课：换场次、清空场次、退课、恢复、改日期或备注。

    补课与重听都走"改场次"这条路，没有独立的状态覆盖——覆盖会让"这个人属于
    哪一场"出现两个互相矛盾的答案。

    `session_id` 的显式 `null` 在这里是合法的（清空场次），所以要看
    `model_fields_set` 而不是值本身来区分"没提到"与"设成 null"。
    """
    row = _load(enrollment_id, session)
    given = payload.model_fields_set

    if "session_id" in given:
        _require_session_of(_load_course(row.course_id, session), payload.session_id, session)
        row.session_id = payload.session_id
    if "status" in given:
        if payload.status not in {"enrolled", "withdrawn"}:
            raise HTTPException(status_code=422, detail="状态只能是 enrolled 或 withdrawn")
        row.status = payload.status
    if "enrolled_at" in given and payload.enrolled_at is not None:
        row.enrolled_at = payload.enrolled_at
    if "note" in given and payload.note is not None:
        row.note = payload.note

    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="改完之后会和另一条报课重复") from None
    session.refresh(row)
    return _read_one(row, session)


@router.delete("/{enrollment_id}", status_code=204)
def delete_enrollment(
    enrollment_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> None:
    """删掉一条录错的报课。

    与「退课」不同：退课表示这件事发生过（记录留下），删除表示这条记录本身是错的。
    没有删除入口的话，录错就只能留一条假的退课记录，而那会让"退课"这个词失去意义。
    """
    row = _load(enrollment_id, session)
    session.delete(row)
    session.commit()
