import os

from dotenv import load_dotenv
from sqlmodel import Session, create_engine

# Local development reads backend/.env; deployed environments inject the
# variable directly and have no such file, so this is a no-op there.
load_dotenv()


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


def resolve_database_url() -> str:
    """Read DATABASE_URL from the environment, or refuse to start.

    There is deliberately no localhost fallback. A default would make a
    deployment that forgot to set DATABASE_URL *look* healthy — the process
    boots, the platform's health check passes — and then fail on every request
    with "connection refused to 127.0.0.1", which reads as nonsense in a cloud
    log. Better to stop at startup and name the missing variable.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. For local development, copy "
            "backend/.env.example to backend/.env (the Supabase CLI's local "
            "stack is already filled in there). For a deployed environment, "
            "set it in the platform's environment variables."
        )
    return normalize_database_url(url)


DATABASE_URL = resolve_database_url()

engine = create_engine(DATABASE_URL)


def get_session():
    with Session(engine) as session:
        yield session
