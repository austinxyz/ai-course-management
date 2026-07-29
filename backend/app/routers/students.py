from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Student
from app.schemas import TZ_BY_REGION, StudentCreate, StudentRead, StudentUpdate

router = APIRouter(prefix="/api/students", tags=["students"])


def _to_read(student: Student) -> StudentRead:
    return StudentRead(
        email=student.email,
        name=student.name,
        wechat=student.wechat,
        wx_name=student.wx_name,
        nick=student.nick,
        region=student.region,
        tz=TZ_BY_REGION.get(student.region, "—"),
        level=student.level,
        source=student.source,
        tags=student.tags,
        note=student.note,
        gender=student.gender,
        age=student.age,
        industry=student.industry,
    )


@router.get("", response_model=list[StudentRead])
def list_students(archived: bool = False, session: Session = Depends(get_session)):
    # Default is the in-study roster — archived students are excluded unless
    # asked for. The response shape is identical either way; only membership
    # changes, so the existing read contract is untouched.
    clause = (
        Student.archived_at.is_not(None) if archived else Student.archived_at.is_(None)
    )
    # Ordering is not cosmetic here. Without it Postgres returns rows in heap
    # order, and an UPDATE writes a new tuple at the end of the heap — so
    # editing one field silently moved that student to the bottom of the
    # roster. Email breaks name ties, which Chinese names produce readily; an
    # unbroken tie is the same defect at a smaller scale.
    students = session.exec(
        select(Student).where(clause).order_by(Student.name, Student.email)
    ).all()
    return [_to_read(s) for s in students]


@router.get("/{email}", response_model=StudentRead)
def get_student(email: str, session: Session = Depends(get_session)):
    student = _find(email, session)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")
    return _to_read(student)


@router.post("", response_model=StudentRead, status_code=201)
def create_student(body: StudentCreate, session: Session = Depends(get_session)):
    existing = _find(body.email, session)
    if existing is not None:
        # Distinguish the two collisions: an active student sends the caller to
        # that record, an archived one has to be restored deliberately. In
        # neither case do we write — an archived record holds notes, tags and a
        # wechat handle collected earlier, and overwriting them to satisfy a
        # duplicate submission would destroy the hardest-won data in the system.
        detail = (
            "email belongs to an archived student"
            if existing.archived_at is not None
            else "email already exists"
        )
        raise HTTPException(status_code=409, detail=detail)

    student = Student(**body.model_dump())
    session.add(student)
    session.commit()
    session.refresh(student)
    return _to_read(student)


@router.patch("/{email}", response_model=StudentRead)
def update_student(
    email: str, body: StudentUpdate, session: Session = Depends(get_session)
):
    student = _find(email, session)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")

    # exclude_unset is the whole point: only fields the caller actually sent
    # are applied. A field left out keeps its stored value; a field sent as ""
    # is an intentional clear and does get written.
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(student, field, value)

    session.add(student)
    session.commit()
    session.refresh(student)
    return _to_read(student)


@router.post("/{email}/archive", response_model=StudentRead)
def archive_student(email: str, session: Session = Depends(get_session)):
    # No request body at all — archiving carries exactly one fact, "this
    # happened now", and the server is the only party that can state it
    # truthfully. Accepting a caller-supplied time would make the audit value
    # client-controlled.
    return _set_archived(email, datetime.now(UTC), session)


@router.post("/{email}/restore", response_model=StudentRead)
def restore_student(email: str, session: Session = Depends(get_session)):
    return _set_archived(email, None, session)


def _set_archived(
    email: str, value: datetime | None, session: Session
) -> StudentRead:
    student = _find(email, session)
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")

    # Only archived_at moves. Everything else is left alone so a round trip
    # through archive/restore is lossless — the soft delete keeps the record.
    student.archived_at = value
    session.add(student)
    session.commit()
    session.refresh(student)
    return _to_read(student)


def _find(email: str, session: Session) -> Student | None:
    return session.exec(
        select(Student).where(func.lower(Student.email) == email.lower())
    ).first()
