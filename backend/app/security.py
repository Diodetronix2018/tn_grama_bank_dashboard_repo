"""API-key auth and rate limiting.

This is the interim access-control layer called for in the implementation
plan's Phase 5: it stops casual scraping and unauthenticated access, but a
key shipped to a browser is visible to anyone who opens dev tools. It is
not a substitute for a real identity provider (Cognito, etc.) -- that
decision is still open, tracked as a Phase 0 item. Treat this key the way
you'd treat a "staging" credential, not a production secret.
"""

import logging

from fastapi import Header, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

logger = logging.getLogger("app.security")

limiter = Limiter(key_func=get_remote_address)


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    settings = get_settings()
    if not x_api_key or x_api_key not in settings.api_key_set:
        client_ip = get_remote_address(request)
        logger.warning("auth_failed client_ip=%s path=%s", client_ip, request.url.path)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key",
        )
