import os

# Point the suite at the Supabase CLI's local stack before anything imports
# app.db — that module now refuses to import without DATABASE_URL, on purpose
# (see resolve_database_url). setdefault, so CI or a developer can override it.
DATABASE_URL = os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import Session  # noqa: E402


@pytest.fixture
def db_session():
    """Yields a session bound to a transaction that is rolled back after
    the test, so tests never leave data behind in the local Supabase DB."""
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        if transaction.is_active:
            transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session):
    """TestClient whose requests run inside db_session's rolled-back
    transaction, so any writes a request makes never persist."""
    from app.db import get_session
    from app.main import app

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
