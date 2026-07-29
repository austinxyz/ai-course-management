from typing import Literal

from pydantic import BaseModel

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
