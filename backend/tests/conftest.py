import os

# Point the suite at the Supabase CLI's local stack before anything imports
# app.db — that module now refuses to import without DATABASE_URL, on purpose
# (see resolve_database_url). setdefault, so CI or a developer can override it.
DATABASE_URL = os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)

# Same ordering reason as DATABASE_URL: the app refuses to serve without a
# secret, so it has to exist before anything imports app.main.
BACKEND_SECRET = os.environ.setdefault("BACKEND_SECRET", "test-secret-not-a-real-one")
SECRET_HEADER = "X-Backend-Secret"

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
    """Authenticated TestClient — carries the shared secret on every request,
    so tests of ordinary behaviour exercise the same path the real frontend
    uses. Requests run inside db_session's rolled-back transaction, so any
    writes never persist. For the rejection cases, use anon_client."""
    from app.db import get_session
    from app.main import app

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        yield TestClient(app, headers={SECRET_HEADER: BACKEND_SECRET})
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def anon_client(db_session):
    """TestClient with no shared secret — for asserting that unauthenticated
    callers are turned away."""
    from app.db import get_session
    from app.main import app

    app.dependency_overrides[get_session] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
