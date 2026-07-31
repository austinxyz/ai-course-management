"""作业提交记录的存储形状。

这一份钉的是**分项评分的列顺序**。各课的分项列零交集（S1 是 A1–D2 共 10 项，
S2 是 E1–G2 共 9 项），而列的先后顺序是评分表分组结构的唯一载体
（A 工作流 / B 提示词 / C 输出 / D 心得）。

顺序丢了就再也复原不了，且没有任何征兆——页面照常渲染，只是分组乱了。
"""

import uuid
from datetime import date

import pytest
from sqlmodel import select

from app.models import Course, HomeworkSubmission, Student


def _seed_person_and_course(db_session):
    course = Course(name="课程甲", short="S1")
    student = Student(
        email="alpha@example.com",
        name="学员甲",
        region="美东",
        level="小白",
        source="讲武堂",
    )
    db_session.add(course)
    db_session.add(student)
    db_session.commit()
    db_session.refresh(course)
    return student, course


# S1 真实表头的形状：A 组三项、B 组三项……分组信息只存在于顺序里。
S1_ITEMS = [
    {"item": "A1工作流结构", "score": 11},
    {"item": "A2数据传递", "score": 9},
    {"item": "A3Cowork特性", "score": 0},
    {"item": "B1提示词三要素", "score": 13},
    {"item": "B2输出路径", "score": 9},
    {"item": "B3可复现性", "score": 3},
    {"item": "C1输出真实性", "score": 7},
    {"item": "C2输出匹配度", "score": 8},
    {"item": "D1心得字数", "score": 10},
    {"item": "D2心得深度", "score": 7},
]


def test_scores_round_trip_preserves_column_order(db_session):
    """存进去什么顺序，取出来还是什么顺序。

    断言比较的是**有序序列**，不是集合、不是 dict。这一点是刻意的：
    如果 `scores` 被实现成 JSON 对象（`{"A1工作流结构": 11, …}`），
    Postgres 的 jsonb 会按键长度、再按字节序重排——`A3Cowork特性` 会跑到
    `B1提示词三要素` 后面去。而集合相等的断言对这个缺陷完全看不见。
    """
    student, course = _seed_person_and_course(db_session)

    db_session.add(
        HomeworkSubmission(
            student_email=student.email,
            course_id=course.id,
            submitted_at=date(2026, 6, 11),
            total=77,
            scores=S1_ITEMS,
            highlight="Agent1 提示词详细",
            improve="补中间输出",
            reply_status="待回复",
            source_ref="session1/grades.csv:2",
        )
    )
    db_session.commit()
    db_session.expire_all()

    row = db_session.exec(select(HomeworkSubmission)).one()

    assert [s["item"] for s in row.scores] == [s["item"] for s in S1_ITEMS]
    assert [s["score"] for s in row.scores] == [s["score"] for s in S1_ITEMS]


def test_a_different_course_needs_no_schema_change(db_session):
    """S2 那套分项列名与 S1 毫无交集，照样存得下。"""
    student, course = _seed_person_and_course(db_session)
    s2_items = [
        {"item": "E1领域与结构", "score": 9},
        {"item": "E2Wiki数量", "score": 10},
        {"item": "E3Wiki结构", "score": 3},
        {"item": "F1PPT提交", "score": 7},
        {"item": "G2心得深度", "score": 8},
    ]

    db_session.add(
        HomeworkSubmission(
            student_email=student.email,
            course_id=course.id,
            submitted_at=date(2026, 6, 20),
            total=73,
            scores=s2_items,
            source_ref="session2/grades.csv:2",
        )
    )
    db_session.commit()
    db_session.expire_all()

    row = db_session.exec(select(HomeworkSubmission)).one()
    assert [s["item"] for s in row.scores] == [s["item"] for s in s2_items]


def test_one_submission_per_person_per_course(db_session):
    """同一人同一课只能有一条。作业按人计，不按报课记录计。"""
    from sqlalchemy.exc import IntegrityError

    student, course = _seed_person_and_course(db_session)
    for _ in range(2):
        db_session.add(
            HomeworkSubmission(
                student_email=student.email,
                course_id=course.id,
                submitted_at=date(2026, 6, 11),
                total=77,
                scores=[],
                source_ref="session1/grades.csv:2",
            )
        )

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_same_person_can_submit_for_two_courses(db_session):
    """唯一键是 (学员, 课程)，不是 (学员)。"""
    student, course = _seed_person_and_course(db_session)
    other = Course(name="课程乙", short="S2")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    for c in (course, other):
        db_session.add(
            HomeworkSubmission(
                student_email=student.email,
                course_id=c.id,
                submitted_at=date(2026, 6, 11),
                total=70,
                scores=[],
                source_ref="x:1",
            )
        )
    db_session.commit()

    assert len(db_session.exec(select(HomeworkSubmission)).all()) == 2


def test_id_is_generated_by_the_application(db_session):
    """主键由应用生成，不靠 DB 默认值。

    SQLModel 会把显式 None 发成 SQL NULL，盖掉列的 DB 默认值——
    `default=None` 配 `not null default gen_random_uuid()` 会在插入时炸，
    而报错位置离"我明明给了默认值"很远。
    """
    student, course = _seed_person_and_course(db_session)
    row = HomeworkSubmission(
        student_email=student.email,
        course_id=course.id,
        submitted_at=date(2026, 6, 11),
        total=70,
        scores=[],
        source_ref="x:1",
    )

    assert isinstance(row.id, uuid.UUID)
