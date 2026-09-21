import logging
import re
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import Settings, get_settings
from app.data import get_data_source
from app.logging_config import configure_logging
from app.routers import branches, health
from app.security import limiter

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger("app.main")


def _validate_dynamodb_settings(settings: Settings) -> None:
    if settings.data_source != "dynamodb":
        return
    missing = [
        name
        for name, value in (
            ("AWS_REGION", settings.aws_region),
            ("DYNAMODB_TABLE_NAME", settings.dynamodb_table_name),
            ("AWS_ACCESS_KEY_ID", settings.aws_access_key_id),
            ("AWS_SECRET_ACCESS_KEY", settings.aws_secret_access_key.get_secret_value()),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            "DATA_SOURCE=dynamodb requires " + ", ".join(missing) + " to be set (see .env.example)"
        )


_validate_dynamodb_settings(settings)
try:
    get_data_source()  # eager construction -- surfaces bad config now, not on first request
except Exception as exc:
    logger.error("startup_data_source_init_failed error=%s", exc)
    raise RuntimeError("Failed to initialize the configured data source at startup") from exc


def _docs_kwargs(environment: str) -> dict[str, str | None]:
    if environment == "production":
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}


app = FastAPI(
    title="TN Grama Bank -- Branch Data API",
    description="Serves branch-security records to the dashboard frontend.",
    version="1.0.0",
    **_docs_kwargs(settings.environment),
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_allow_origin],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["X-API-Key"],
)


_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    incoming = request.headers.get("X-Request-ID")
    request_id = incoming if incoming and _REQUEST_ID_RE.match(incoming) else str(uuid.uuid4())
    request.state.request_id = request_id

    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request request_id=%s method=%s path=%s status=%d duration_ms=%.1f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # This handler runs from Starlette's ServerErrorMiddleware, which sits
    # OUTSIDE CORSMiddleware and both middlewares above -- a response built
    # here does not automatically get CORS headers or the request-id header,
    # and log_requests' own summary line never fires for this path (control
    # never returns to it). Set what's needed manually; CORS is safe to set
    # unconditionally since this API allows exactly one static origin, not a
    # reflected one.
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(
        "unhandled_exception request_id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
    )
    response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    response.headers["Access-Control-Allow-Origin"] = settings.cors_allow_origin
    response.headers["X-Request-ID"] = request_id
    return response


app.include_router(health.router)
app.include_router(branches.router)

logger.info(
    "startup data_source=%s cors_origin=%s environment=%s", settings.data_source, settings.cors_allow_origin, settings.environment
)
