import os

from fastapi import FastAPI

from app.auth import require_shared_secret
from app.routers.courses import router as courses_router
from app.routers.enrollments import router as enrollments_router
from app.routers.students import router as students_router

# Opt in to the interactive docs, rather than switching them off when the
# environment looks like production. Both spellings read the same on a good
# day; they differ on a bad one. A misread environment leaves this one closed,
# whereas `if is_production: disable` would publish the schema — and with it
# the field names (wechat, email, nick), i.e. what kind of personal data this
# system holds. Local development sets ENABLE_API_DOCS in .env; nothing else does.
_docs_enabled = bool(os.environ.get("ENABLE_API_DOCS"))

app = FastAPI(
    title="学员管理系统 API",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
app.middleware("http")(require_shared_secret)
app.include_router(students_router)
app.include_router(courses_router)
app.include_router(enrollments_router)
