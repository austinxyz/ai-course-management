from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.db import get_session
from app.models import Student
from app.schemas import TZ_BY_REGION, StudentRead

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
def list_students(session: Session = Depends(get_session)):
    students = session.exec(select(Student)).all()
    return [_to_read(s) for s in students]


@router.get("/{email}", response_model=StudentRead)
def get_student(email: str, session: Session = Depends(get_session)):
    student = session.exec(
        select(Student).where(func.lower(Student.email) == email.lower())
    ).first()
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")
    return _to_read(student)
