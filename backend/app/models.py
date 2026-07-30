import uuid
from datetime import date, datetime, time

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class Student(SQLModel, table=True):
    __tablename__ = "students"

    email: str = Field(primary_key=True)
    name: str
    wechat: str = Field(default="")
    wx_name: str = Field(default="—")
    nick: str = Field(default="—")
    region: str
    level: str
    source: str
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSONB, nullable=False))
    note: str = Field(default="")
    gender: str = Field(default="—")
    age: str = Field(default="—")
    industry: str = Field(default="—")
    # null = 在读。软删除，记录与关联数据都保留。
    archived_at: datetime | None = Field(default=None)


class Course(SQLModel, table=True):
    """一门课。主键与课程名、简称都无关，因为两者都会改。"""

    __tablename__ = "courses"

    # 主键由应用生成。DB 侧也有 gen_random_uuid() 默认值，供绕过 API 的直写使用；
    # 但 SQLModel 会把 None 显式发出去、盖掉 DB 默认，所以这里自己生成。
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    short: str = Field(default="")
    tagline: str = Field(default="")
    intro: str = Field(default="")
    # 分钟，不是小时：真实课程 150 分钟，整小时表达不了。
    duration_minutes: int = Field(default=120)
    homework_title: str = Field(default="")
    # 上架 / 已下线。课程没有删除——已下线仍列出，历史报课与作业不受影响。
    offline: bool = Field(default=False)
    # 新增场次时的预选时区。只影响将来——不回溯已有场次。
    default_tz: str = Field(default="America/Los_Angeles")
    # created_at 有意不映射：DB 有 now() 默认值，应用既不读也不写它。
    # 映射成可空字段会让 SQLModel 插入显式 NULL，撞上 NOT NULL。


class CourseAlias(SQLModel, table=True):
    """平台里这门课的一种写法。主键是归一化后的值，全库唯一。"""

    __tablename__ = "course_aliases"

    alias: str = Field(primary_key=True)
    raw: str
    course_id: uuid.UUID = Field(foreign_key="courses.id")


class CourseSession(SQLModel, table=True):
    """一门课的一场。每场自己的讲师、状态与备注。"""

    __tablename__ = "course_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    # 墙上时间 + 时区名。绝对时刻是派生物，读取时算，不入库——时区规则会变，
    # 而"美西 19:30"是讲师的意图。
    local_date: date
    local_time: time
    tz: str = Field(default="America/Los_Angeles")
    teacher: str
    # null = 跟随日期。非空为人工覆盖（pending / done / cancelled）。
    state_override: str | None = Field(default=None)
    note: str = Field(default="")
    # created_at 同 Course：不映射。
