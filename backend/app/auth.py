import os
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse

SECRET_HEADER = "X-Backend-Secret"


async def require_shared_secret(request: Request, call_next):
    """Reject anything that does not carry the shared secret.

    Registered as middleware rather than a router dependency so that coverage
    is subtractive: a route added later is protected by default, instead of
    protected only if someone remembers to attach a dependency to it.

    The two checks below are deliberately kept apart. Folding them into one
    condition — `if expected and provided != expected` — reads fine and lets
    every request through whenever the variable is unset, which is exactly the
    deployment mistake this is meant to catch. A missing secret must mean "no
    one gets in", not "everyone does": the former shows up the first time
    anyone loads the site, the latter shows up never.
    """
    expected = os.environ.get("BACKEND_SECRET")
    if not expected:
        return _unauthorized()

    provided = request.headers.get(SECRET_HEADER)
    if not provided or not secrets.compare_digest(provided, expected):
        return _unauthorized()

    return await call_next(request)


def _unauthorized() -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": "unauthorized"})
