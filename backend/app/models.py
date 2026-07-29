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
