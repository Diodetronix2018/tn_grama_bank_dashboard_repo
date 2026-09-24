"""Session-cookie auth and rate limiting.

Access to /api/branches (and everything else that matters) requires a valid
session cookie, issued by /api/auth/login after a real Cognito check (see
app/auth/session.py and app/routers/auth.py). The earlier X-API-Key model
was always an explicit stopgap for exactly this; it's been removed rather
than kept alongside sessions, since a static never-expiring key would be a
strictly weaker parallel front door.

Rate limiting (via slowapi's Limiter below) is in-memory and single-process
-- it does not coordinate across multiple uvicorn workers or multiple
instances behind a load balancer. Accepted tradeoff today (no deployment
target chosen, no Redis/shared store introduced); revisit only once a real
multi-instance topology exists.
"""

import logging

from fastapi import Cookie, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth.session import verify_session_token
from app.config import get_settings

logger = logging.getLogger("app.security")


def get_client_ip(request: Request) -> str:
    """The IP to key auth-failure logs and rate limiting on.

    Trusts X-Forwarded-For only when settings.trust_proxy_headers is True,
    and only its *last* entry -- correct for exactly one trusted proxy hop
    in front of this app (that proxy appends the true client IP; the first
    entry, if any, is fully client-controlled and must not be trusted).
    """
    settings = get_settings()
    if settings.trust_proxy_headers:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[-1].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip)


def _log_auth_failed(request: Request, reason: str) -> None:
    client_ip = get_client_ip(request)
    request_id = getattr(request.state, "request_id", "-")
    logger.warning(
        "auth_failed reason=%s client_ip=%s path=%s request_id=%s",
        reason, client_ip, request.url.path, request_id,
    )


async def require_session(
    request: Request,
    tngb_session: str | None = Cookie(default=None),
) -> None:
    settings = get_settings()
    claims = verify_session_token(tngb_session, settings) if tngb_session else None
    if claims is None:
        _log_auth_failed(request, "invalid_or_missing_session")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    request.state.session_claims = claims


async def require_admin(request: Request, _: None = Depends(require_session)) -> None:
    groups = request.state.session_claims.get("groups") or []
    if "admins" not in groups:
        _log_auth_failed(request, "not_admin")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
