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
    # 指向这一场、且未退课的报课条数。归档的学员照算——归档说的是"这个人还在不在
    # 名单里"，报课说的是"他报没报这门课"，两件事。界面在为 0 时不显示它。
    enrolled_count: int


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
    # 报了这门课但还没定上哪一场、且未退课的条数。不另计的话这批人在课程页上
    # 完全不可见（他们不属于任何一场），"总报名 12 人、四场加起来 9 人"的差额无处可查。
    undecided_count: int
    # 报课**人数**（按学员去重）。重复听同一门课的人有多条记录，但只是一个人——
    # 作业也只算一份。
    enrolled_people: int


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


EnrollmentSource = Literal["manual", "platform", "derived"]
"""报课记录的来源。

用 `Literal` 是**请求体**校验，不是响应校验——只读响应上放 Literal 时，
一行落在枚举外会让整个列表接口 500，而不是那一行出错。所以 `EnrollmentRead.source`
仍是 `str`。
"""


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
    # 三种：manual（人特意录的）/ platform（平台同步）/ derived（从别处倒推的占位）。
    # 界面补录不传它，落默认的 manual；倒推脚本显式给 derived。
    #
    # 取值只能在这里挡：列是 text 且没有 CHECK 约束（与 region/level 同一判断，
    # 给未来留口子）。不挡的话第四种值会悄悄进来，而将来的覆盖规则是按三值写的。
    source: EnrollmentSource = "manual"


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

    @field_validator("status", "enrolled_at", "note")
    @classmethod
    def _reject_explicit_null(cls, value: object) -> object:
        # 同 StudentUpdate / SessionUpdate：`None` 表示"没提到这个字段"，
        # 而这三项背后的列都是 NOT NULL，显式 null 放进去就是未捕获的 500。
        # 没有第三种状态可编码，只能在边界上拒绝。
        #
        # `session_id` **不在**这个列表里：它本来就可空，显式 null 是合法的
        # "清空场次"，也是补课流程唯一的表达方式。
        if value is None:
            raise ValueError("null is not a valid value; omit the field instead")
        return value


class ScoreItem(BaseModel):
    """一个分项：列名 + 得分。

    成对存而不是 `{列名: 分}`，是因为 Postgres 的 `jsonb` 不保证对象键顺序
    （按键长度、再按字节序重排），而分项列的先后是评分表分组结构的唯一载体
    （A 工作流 / B 提示词 / C 输出 / D 心得）。实测 10 个真实列名过一遍 jsonb
    对象会被打散成 A2 A3 B2 B3 D1 D2 A1 C1 C2 B1——分组彻底毁掉，且毫无征兆。
    """

    item: str
    score: int


class HomeworkRow(BaseModel):
    """源文件里的一行，已经过解析层归一化。

    所有字段都对应 NOT NULL 列，因此**没有一个**允许显式 null——
    这与 `EnrollmentUpdate.session_id` 相反：那一列本来可空，null 是合法输入。
    "该不该挡 null"要按列的可空性逐个决定，一刀切两个方向都会错。
    """

    student_email: str
    submitted_at: date
    # 原样取自源文件的「总分」列。有意不做 `sum(scores)` 的一致性校验：
    # session2/grades.csv 里真有一行对不上，而镜像的职责是忠实，不是纠正。
    total: int
    scores: list[ScoreItem] = []
    highlight: str = ""
    improve: str = ""
    # 原样存源文件的值（实测有「待回复」「草稿已创建」），不归一化。
    reply_status: str = ""
    source_ref: str = ""


class HomeworkImportRequest(BaseModel):
    """一次导入：文件的**原始字节**（base64）+ 目标课程。

    送字节而不是文本：编码判定必须拿到原始字节。一旦在 Next 侧用 `file.text()`
    读成字符串，浏览器已经按 UTF-8 解过一遍，GBK 文件在那一步就变成替换字符了，
    后端再想试 GB18030 已经没有原始字节可试。

    课程两种入参都收：网页手里已经有 `course_id`（在 URL 里，选不错），
    而将来通过 MCP 调用的批改流程手里只有一份刚批完的文件和"这是 S1"这个概念——
    逼它先查一遍课程列表按名字匹配，等于把别名表的职责重写一遍在调用方。
    两者都不给则拒绝整份导入：**不从文件名、路径或内容推断课程。**
    """

    content_base64: str
    # 只用于报告与 `source_ref`，**不参与**课程判断。
    filename: str = ""
    course_id: uuid.UUID | None = None
    course_alias: str | None = None


class HeaderMismatch(BaseModel):
    """上传文件的分项列与该课程既有成绩的分项列不同。

    两边都列出来：这个信号最常见的成因是传错了课程，而"数据缺口"那类提示
    表达不了这件事。它是**警告不是拒绝**——课程真的改了评分表是合法的。
    """

    file_items: list[str]
    existing_items: list[str]


class ImportRow(BaseModel):
    """预览里将写入的一行。

    姓名带出来**只为报告可读**，关联一律走邮箱——姓名与微信昵称都会变。
    `action` 让"将新建"与"将更新"分得出：确认按钮上的数字由它们汇总而来。
    """

    email: str
    name: str
    total: int
    # create | update
    action: str


class HomeworkImportResult(BaseModel):
    """导入结果。dry-run 与真跑用**同一个**形状。

    自描述是硬要求：已知的下一个调用方是 MCP，那边没有人在看屏幕，
    只能靠返回值判断发生了什么。
    """

    # **始终**报出，包括判定为 UTF-8 时——只在异常时出现的话，
    # 用户永远不知道正常长什么样，也就无从判断这次是不是异常。
    encoding: str
    # 解析出的有效行数（已去重、已去掉无邮箱的行）。
    row_count: int
    created: int
    updated: int
    # 两份清单是**两个字段**，不合并：一类是本次自动建档的邮箱（新学员），
    # 另一类要补报课记录（成绩已经写了，但页面上一行都不会出现）。
    auto_created: list[str]
    skipped_no_enrollment: list[str]
    # 被同一人更晚的一次提交顶掉的行（`文件:行号`）。
    superseded: list[str]
    # 邮箱为空的行（`文件:行号`）。没有邮箱就关联不到人。
    rows_without_email: list[str]
    # 命中排除名单、因而没有写入的邮箱。
    excluded: list[str]
    # 将写入的那些人，逐行。预览的「以后不算作业」控件挂在这上面——
    # 会被写进去的行恰恰最需要它。
    rows: list[ImportRow] = []
    header_warning: HeaderMismatch | None = None


class ExcludedEmailCreate(BaseModel):
    """把一个邮箱**永久**加入排除名单。"""

    email: str
    note: str = ""


class ExcludedEmailRead(BaseModel):
    email: str
    note: str


class HomeworkImportRead(BaseModel):
    """作业页上的「上次导入 …」。"""

    filename: str
    encoding: str
    row_count: int
    created_count: int
    updated_count: int
    imported_at: datetime


class HomeworkPersonRead(BaseModel):
    """名单里的一个人。

    有提交的部分全是可空的：没交的人**没有**总分，而不是 0 分——0 是一个真实的
    分数（S1 里就有人 A3 得 0），把两者混成同一个值会让"他没交"读成"他考了 0"。

    `state` 是 `str` 而不是 `Literal`：这是只读响应，而枚举值将来会变。
    列表接口上一个落在集合外的值会让**整个响应**校验失败（500），
    不是那一行出错——`student-management` 踩过一次。
    """

    student_email: str
    name: str
    wechat: str
    # submitted | missing | not_open | no_session
    state: str

    submitted_at: date | None = None
    total: int | None = None
    scores: list[ScoreItem] = []
    highlight: str = ""
    improve: str = ""
    reply_status: str = ""
    source_ref: str = ""
    # 本课名次与总人数。没交的人没有名次。
    rank: int | None = None
    rank_of: int = 0
    # 没有提交的人这三项分别是 None / False / None——讲师标记只对已交的
    # 提交有意义，没交的人无从标记。
    submission_id: uuid.UUID | None = None
    replied: bool = False
    replied_at: datetime | None = None


class HomeworkReplyMarkRead(BaseModel):
    """标记（或取消标记）已回复之后的响应。只报这一条提交需要的两个字段——
    调用方是详情面板上的一次按钮点击，不需要整条提交记录。"""

    replied: bool
    replied_at: datetime | None
