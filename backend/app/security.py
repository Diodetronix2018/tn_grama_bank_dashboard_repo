"""API-key auth and rate limiting.

This is the interim access-control layer called for in the implementation
plan's Phase 5: it stops casual scraping and unauthenticated access, but a
key shipped to a browser is visible to anyone who opens dev tools. It is
not a substitute for a real identity provider (Cognito, etc.) -- that
decision is still open, tracked as a Phase 0 item. Treat this key the way
you'd treat a "staging" credential, not a production secret.

Rate limiting (via slowapi's Limiter below) is in-memory and single-process
-- it does not coordinate across multiple uvicorn workers or multiple
instances behind a load balancer. Accepted tradeoff today (no deployment
target chosen, no Redis/shared store introduced); revisit only once a real
multi-instance topology exists.
"""

import logging

from fastapi import Header, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

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


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    settings = get_settings()
    if not x_api_key or x_api_key not in settings.api_key_set:
        client_ip = get_client_ip(request)
        request_id = getattr(request.state, "request_id", "-")
        logger.warning(
            "auth_failed client_ip=%s path=%s request_id=%s", client_ip, request.url.path, request_id
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )
