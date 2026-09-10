import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.logging_config import configure_logging
from app.routers import branches, health
from app.security import limiter

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger("app.main")

app = FastAPI(
    title="TN Grama Bank -- Branch Data API",
    description="Serves branch-security records to the dashboard frontend.",
    version="1.0.0",
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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    logger.info(
        "request method=%s path=%s status=%d duration_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


app.include_router(health.router)
app.include_router(branches.router)

logger.info("startup data_source=%s cors_origin=%s", settings.data_source, settings.cors_allow_origin)
