import os

from sqlmodel import Session, create_engine


def normalize_database_url(url: str) -> str:
    """Pin the connection string to the psycopg v3 driver.

    Supabase's console hands out `postgresql://…`. SQLAlchemy reads that bare
    scheme as "use psycopg2", which this project does not install — the app
    would crash on startup with ModuleNotFoundError. Rewriting the scheme here
    (rather than asking whoever fills in the env var to remember `+psycopg`)
    keeps a driver-selection detail from leaking into deployment config.

    `postgres://` gets the same treatment: it is a legacy spelling SQLAlchemy
    no longer accepts at all, and it still shows up in copy-pasted connection
    strings.

    Only the scheme changes; host, port, credentials and database name are
    left untouched. A URL that already names a driver is returned as-is.
    """
    for bare_scheme in ("postgresql://", "postgres://"):
        if url.startswith(bare_scheme):
            return "postgresql+psycopg://" + url[len(bare_scheme) :]
    return url


DATABASE_URL = normalize_database_url(
    os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    )
)

engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session
