import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import CheckConstraint, Column
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


class Enrollment(SQLModel, table=True):
    """一条报课：这个学员报了这门课，可能指明了上哪一场。

    挂课程而非挂场次：换场次时这条记录本身不变（改一个字段），"他什么时候报的名"
    不会丢；挂场次的话换场就得删一条建一条。
    """

    __tablename__ = "enrollments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_email: str = Field(foreign_key="students.email")
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    # 可空 = 还没定上哪一场。是需要跟进的状态，不是缺陷。
    session_id: uuid.UUID | None = Field(default=None, foreign_key="course_sessions.id")
    enrolled_at: date
    # 只存人决定的两种：enrolled / withdrawn。"已完成"不入库，读取时由场次派生。
    status: str = Field(default="enrolled")
    source: str = Field(default="manual")
    note: str = Field(default="")
    # created_at 同 Course / CourseSession：应用不读不写，不映射。


class HomeworkSubmission(SQLModel, table=True):
    """一次作业提交：`grades.csv` 里的一行。

    键是「学员 + 课程」，**不含场次**——同一个人重复听同一门课会有多条报课，
    但只欠一份作业。存了场次就要回答"这份作业算哪一场的"，而那个问题无解。
    """

    __tablename__ = "homework_submissions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_email: str = Field(foreign_key="students.email")
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    submitted_at: date
    # 原样取自源文件，不由分项求和。source 里真有一行「总分 ≠ 分项之和」。
    total: int
    # **数组**而非对象：jsonb 不保证对象键顺序，而列序是评分表分组的唯一载体。
    scores: list[dict] = Field(default_factory=list, sa_column=Column(JSONB, nullable=False))
    highlight: str = Field(default="")
    improve: str = Field(default="")
    # 原样存源文件的值，不归一化。
    reply_status: str = Field(default="")
    # "session1/grades.csv:7"
    source_ref: str = Field(default="")
    # 讲师手动标记，独立于 reply_status——那一列每次导入整列覆盖，
    # 标记若共用同一份存储会被下一次导入悄悄冲掉。
    replied: bool = Field(default=False)
    replied_at: datetime | None = Field(default=None)
    # 批改报告导入的逐分项评语，跟 `scores` 同一个形状。只存被讲师勾选写入的
    # 那几项，不是整份报告的镜像。
    dimension_comments: list[dict] = Field(
        default_factory=list, sa_column=Column(JSONB, nullable=False)
    )
    # `highlight`/`improve` 一旦被报告导入覆盖过就设为真——重新导入 grades.csv
    # 时 `_classify` 要跳过这两列，不然报告的细致版本会被 csv 的精简版冲掉。
    highlight_locked: bool = Field(default=False)
    # synced_at / created_at 同 Course：DB 有 now() 默认值，应用不读不写，不映射。


class HomeworkRubricItem(SQLModel, table=True):
    """一门课某个分项的满分。讲师在课程页维护。

    独立于 `HomeworkSubmission.scores`（那是 item+score 的 jsonb 数组）——满分是
    课程级配置，不该跟着每条提交重复存，改满分不需要重写历史提交。

    "未配置" 用**这一行不存在**表达，不用可空列 + 哨兵值：少一种"到底是没配还是
    配了个空值"的歧义。
    """

    __tablename__ = "homework_rubric_items"
    __table_args__ = (CheckConstraint("max_score > 0", name="max_score_positive"),)

    course_id: uuid.UUID = Field(foreign_key="courses.id", primary_key=True)
    item: str = Field(primary_key=True)
    max_score: int


class HomeworkExcludedEmail(SQLModel, table=True):
    """一个「不算作业」的邮箱。**全课程通用**。

    键是邮箱而不是学员外键：被排除的人恰恰可能不在 `students` 里
    （讲师本人就是），挂外键等于要求先给他建档。
    """

    __tablename__ = "homework_excluded_emails"

    email: str = Field(primary_key=True)
    note: str = Field(default="")
    # created_at 同 Course：DB 有 now() 默认值，应用不读不写，不映射。


class NudgeEvent(SQLModel, table=True):
    """催作业产生的一条互动事件：已催或跳过。

    不外键到 `enrollments`——报课记录可能被改场次、删除，但催促历史要独立于
    报课记录的生命周期长期保留，与 `homework_submissions` 不外键到
    `enrollments` 同一个理由。`event_type` 不用 `Literal`：只读响应上的枚举
    值落在集合外会让整个列表接口 500，且给未来扩展第三类事件留口子（见
    `nudge` 能力 design.md）。
    """

    __tablename__ = "nudge_events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    student_email: str = Field(foreign_key="students.email")
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    event_type: str
    channel: str | None = Field(default=None)
    note: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HomeworkImport(SQLModel, table=True):
    """一次**实际写入**的导入。dry-run 不产生记录。

    只记元信息，**不存原文**：权威副本在 ai-course 仓库里，这里再存一份
    就多一份含真实姓名邮箱的副本要看管，而它不参与任何功能。
    """

    __tablename__ = "homework_imports"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    course_id: uuid.UUID = Field(foreign_key="courses.id")
    filename: str
    encoding: str
    row_count: int
    created_count: int
    updated_count: int
    # 这一列与 Course.created_at 不同：作业页要**读**它（"上次导入 …"），
    # 所以必须映射。映射了就不能留给 DB 默认——SQLModel 会把 None 显式发出去
    # 盖掉 DB 默认值，撞上 NOT NULL。因此应用侧自己生成，且带时区。
    imported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
