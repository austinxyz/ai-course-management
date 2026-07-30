import uuid
from datetime import date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, field_validator


def _strip_and_require(value: str) -> str:
    """Trim a name and refuse it if nothing is left.

    Every other editable field may be cleared — clearing is a legitimate
    edit. Name may not: it is the identity shown in the list and the detail
    panel, and it is the list's sort key, so a blank one turns a row into an
    unidentifiable gap.

    Trimming happens here rather than at the callers because email is
    normalized the same way and for the same reason: the boundary is the only
    place a normalization stays cheap.
    """
    stripped = value.strip()
    if not stripped:
        raise ValueError("name must not be blank")
    return stripped


# One definition, shared by the create and update bodies below. Two separate
# @field_validator("name") declarations would reproduce the exact hole this
# change exists to close — a rule enforced on update and skipped on create.
StudentName = Annotated[str, AfterValidator(_strip_and_require)]

Region = Literal["美西", "美东", "加拿大", "其他地区"]
Level = Literal["小白", "会电脑", "有基础", "工程师"]
Source = Literal["讲武堂", "理财群", "股票群", "加拿大", "Andrew纽约", "其他"]

TZ_BY_REGION: dict[str, str] = {
    "美西": "UTC-8",
    "美东": "UTC-5",
    "加拿大": "UTC-5",
    "其他地区": "—",
}


class StudentRead(BaseModel):
    """Read-only response shape. region/level/source are plain `str` here,
    not the Region/Level/Source Literal aliases above — those Literals are
    for future write-endpoint request validation. Using them here would make
    response_model validation crash the whole list endpoint (500) the moment
    any stored row holds a value outside the current Literal set, e.g. after
    a new region/level/source is added at the application layer without a
    matching DB migration (see design.md decision #2 — no DB CHECK
    constraint, values are app-layer only)."""

    email: str
    name: str
    wechat: str
    wx_name: str
    nick: str
    region: str
    tz: str
    level: str
    source: str
    tags: list[str]
    note: str
    gender: str
    age: str
    industry: str


class StudentCreate(BaseModel):
    """New-student body. Email is required and becomes the primary key.

    Everything past the enums is optional with a default, matching the UI:
    only name and email are marked required there, and the rest can be filled
    in later — most notably the wechat handle, which usually needs a manual
    match against a group roster before it is known.
    """

    email: str
    name: StudentName
    region: Region
    level: Level
    source: Source
    wechat: str = ""
    wx_name: str = "—"
    nick: str = "—"
    industry: str = "—"
    gender: str = "—"
    age: str = "—"
    note: str = ""
    tags: list[str] = []

    @field_validator("email")
    @classmethod
    def _lowercase_email(cls, value: str) -> str:
        # Email is the join key against EliteCoach101 enrollment and grades.csv,
        # which carry whatever casing the student typed. Storing the literal we
        # were handed would let one person exist under two keys, and the joins
        # would drop rows without complaining. Normalizing on the way in is the
        # only place that fix stays cheap.
        return value.strip().lower()


class StudentUpdate(BaseModel):
    """Partial update body — the UI commits one field at a time.

    Every field is optional, and callers read the result with
    `model_dump(exclude_unset=True)`. That is what separates "this request
    does not mention the note" from "this request sets the note to empty":
    clearing a note is a legitimate edit, and treating the two alike would
    silently turn it into a no-op.

    `email` is absent by construction — it is the primary key and the UI
    states it cannot change, so there is no field here to change it with.
    `archived_at` is absent too: archiving is an action with its own endpoint,
    and the server, not the caller, decides when it happened.

    region/level/source use the Literal aliases here. This is the request
    body, which is where they belong — on a response they would let a single
    unexpected stored value fail the entire payload.
    """

    # StudentName, not plain str: the trim-and-require rule rides on the type,
    # so it cannot drift apart from StudentCreate's. `| None` keeps the
    # sentinel intact — None still means "this request did not mention the
    # name", and AfterValidator only runs when the value really is a str. An
    # explicit JSON null lands on the None branch and is refused below.
    name: StudentName | None = None
    wechat: str | None = None
    wx_name: str | None = None
    nick: str | None = None
    region: Region | None = None
    level: Level | None = None
    source: Source | None = None
    industry: str | None = None
    gender: str | None = None
    age: str | None = None
    note: str | None = None
    tags: list[str] | None = None

    @field_validator("*")
    @classmethod
    def _reject_explicit_null(cls, value: object) -> object:
        # `None` here means "the caller did not mention this field" — that is
        # what makes exclude_unset work. An explicit JSON null parses to the
        # same value but means something else, and every column behind these
        # fields is NOT NULL, so letting it through turns an edit into a 500.
        # There is no third state to encode it in, so refuse it at the boundary.
        if value is None:
            raise ValueError("null is not a valid value; omit the field instead")
        return value


class AliasRead(BaseModel):
    """别名回给界面的形状。

    只给 `raw`——用户当初的写法。归一化后的匹配键是内部实现，界面拿它没有用，
    露出去只会诱导前端拿它当标识。
    """

    raw: str


class SessionRead(BaseModel):
    """一场的只读形状。

    墙上时间与时区名都给，因为编辑表单要回填它们；`starts_at` 与 `state` 是算出来的，
    不在库里。前端拿 `starts_at` 直接 `Intl` 格式化成各时区那几行——
    "墙上时间→时刻"这步换算只在后端做一次，JS 里做需要试探偏移再迭代，容易错。

    `state` 用 `str` 而非 `Literal`：只读响应上放 `Literal` 时，一行落在枚举外
    会让整个列表接口 500，而不是那一行出错。
    """

    id: uuid.UUID
    local_date: date
    local_time: time
    tz: str
    teacher: str
    note: str
    starts_at: datetime
    state: str
    # 界面据此显示「跟随日期」还是「恢复跟随日期」。
    state_is_override: bool


class CourseRead(BaseModel):
    """课程 + 别名 + 场次。

    `hours` 用 int、其余枚举性质的字段用 str：只读响应上不放 Literal。
    一行落在枚举外会让整个列表接口 500，而不是那一行出错（见 student-management
    的 pitfall）。
    """

    id: uuid.UUID
    name: str
    short: str
    tagline: str
    intro: str
    duration_minutes: int
    homework_title: str
    offline: bool
    default_tz: str
    aliases: list[AliasRead]
    sessions: list[SessionRead]


def normalize_alias(value: str) -> str:
    """别名的匹配键：去首尾空白 + 转小写。

    平台导出用什么写法不受我们控制，`S1`、`s1`、` S1 ` 指的是同一门课。
    归一化放在边界上，库里就不会出现两个键指同一个逻辑别名——与邮箱转小写同源。
    """
    normalized = value.strip().lower()
    if not normalized:
        raise ValueError("alias must not be blank")
    return normalized


def _strip_and_require_alias(value: str) -> str:
    """别名保留用户写法，但两端空白与空值不算写法。"""
    stripped = value.strip()
    if not stripped:
        raise ValueError("alias must not be blank")
    return stripped


CourseName = Annotated[str, AfterValidator(_strip_and_require)]
AliasRaw = Annotated[str, AfterValidator(_strip_and_require_alias)]


def _known_timezone(value: str) -> str:
    """时区名必须是 zoneinfo 认识的键。

    写错了不会当场出错——它会在读取时炸在换算上，那时离写入点已经很远。
    """
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"unknown timezone: {value!r}") from exc
    return value


TimezoneName = Annotated[str, AfterValidator(_known_timezone)]


# 每场时长，单位分钟。下限 15 挡住 0 与负数，上限 600 挡住手滑多打一个 0。
# 不再限制成整小时——真实课程就是 150 分钟，那正是上一版存不下的值。
CourseDurationMinutes = Annotated[int, Field(ge=15, le=600)]


class CourseCreate(BaseModel):
    """新建课程。只有课程名必填——其余字段讲师往往之后才补。"""

    name: CourseName
    short: str = ""
    tagline: str = ""
    intro: str = ""
    duration_minutes: CourseDurationMinutes = 120
    homework_title: str = ""
    offline: bool = False
    # 新增场次时预选它。写错的时区名会在读取时炸在换算上，所以在边界上校验。
    default_tz: TimezoneName = "America/Los_Angeles"


class CourseUpdate(BaseModel):
    """部分更新。`None` = 这次请求没提到该字段（配合 exclude_unset）。

    显式 JSON null 解析成同一个值却是另一个意思，而每个列都是 NOT NULL，
    所以在边界上拒掉——与 StudentUpdate 同一套哨兵语义。
    """

    name: CourseName | None = None
    short: str | None = None
    tagline: str | None = None
    intro: str | None = None
    duration_minutes: CourseDurationMinutes | None = None
    homework_title: str | None = None
    offline: bool | None = None
    default_tz: TimezoneName | None = None

    @field_validator("*")
    @classmethod
    def _reject_explicit_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("null is not a valid value; omit the field instead")
        return value


class AliasCreate(BaseModel):
    """加一个平台别名。存的是用户写法，匹配用归一化后的值。"""

    raw: AliasRaw


SessionState = Literal["pending", "done", "cancelled"]


TeacherName = Annotated[str, AfterValidator(_strip_and_require)]


class SessionCreate(BaseModel):
    """新增一场。日期、时间、讲师必填——一场课缺哪个都排不成。

    `tz` 有默认值：设计里时间统一按美西填，其他时区是换算出来的。
    """

    local_date: date
    local_time: time
    teacher: TeacherName
    # 不传就取课程的默认时区（端点里解析）。这里不能给一个具体默认值——
    # 那样"课程默认时区"对通过 API 建的场次就毫无作用了。
    tz: TimezoneName | None = None
    note: str = ""


class SessionUpdate(BaseModel):
    """改一场。`None` = 本次请求没提到该字段。

    清除状态覆盖不走这里——显式 null 在此被拒，而"恢复跟随日期"是个动作，
    有自己的端点。
    """

    local_date: date | None = None
    local_time: time | None = None
    teacher: TeacherName | None = None
    tz: TimezoneName | None = None
    state_override: SessionState | None = None
    note: str | None = None

    @field_validator("*")
    @classmethod
    def _reject_explicit_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("null is not a valid value; omit the field instead")
        return value


class EnrollmentRead(BaseModel):
    """一条报课的只读形状。

    `state` 是**算出来的**：库里只存 enrolled / withdrawn，「已完成」由所属场次
    派生。用 `str` 而非 `Literal`，理由同 `SessionRead`——只读响应上的 `Literal`
    会让一行落在枚举外时整个列表接口 500，而不是那一行出错。

    课程名与场次日期一并给出：调用方（学员详情）要显示它们，而它们分散在两张表里，
    让前端再取一次课程列表来查名字既慢又会不一致。
    """

    id: uuid.UUID
    student_email: str
    course_id: uuid.UUID
    course_name: str
    session_id: uuid.UUID | None
    session_date: date | None
    enrolled_at: date
    state: str
    source: str
    note: str


class EnrollmentCreate(BaseModel):
    """补录一条报课。

    `session_id` 可以不给（还没定上哪一场），`note` 可以为空。
    两者都要**真的被处理**——只收必填字段、其余静默丢弃时后端不会报错，
    因为它们都有默认值。
    """

    student_email: str
    course_id: uuid.UUID
    session_id: uuid.UUID | None = None
    enrolled_at: date
    note: str = ""


class EnrollmentUpdate(BaseModel):
    """改一条报课。

    `session_id` 上的显式 `null` 在这里**是合法输入**：它表示"清空场次"，
    而该列本来就可空。这与 `StudentUpdate` 相反——那边的列是 NOT NULL，
    显式 null 只能是误用，所以被挡在边界上。

    区分"没提到这个字段"与"显式设成 null"，靠调用方读 `model_fields_set`，
    不是靠值本身。
    """

    session_id: uuid.UUID | None = None
    status: str | None = None
    enrolled_at: date | None = None
    note: str | None = None
