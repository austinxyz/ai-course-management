import os

from sqlmodel import Session, create_engine

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)

engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session
