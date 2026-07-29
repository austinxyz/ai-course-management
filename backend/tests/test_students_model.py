from sqlalchemy.exc import IntegrityError

from app.models import Student


def make_student(email: str) -> Student:
    return Student(
        email=email,
        name="测试学员",
        wechat="",
        wx_name="—",
        nick="—",
        region="美西",
        level="小白",
        source="讲武堂",
        tags=[],
        note="",
        gender="—",
        age="—",
        industry="—",
    )


def test_duplicate_email_insert_raises_integrity_error(db_session):
    email = "dup-test@example.com"
    db_session.add(make_student(email))
    db_session.commit()

    db_session.add(make_student(email))
    try:
        db_session.commit()
        assert False, "expected IntegrityError on duplicate email insert"
    except IntegrityError:
        db_session.rollback()
