from typing import Literal

from pydantic import BaseModel, field_validator

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
    name: str
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
