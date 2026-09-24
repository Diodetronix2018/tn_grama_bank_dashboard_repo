"""Signed, stateless session cookies.

Deliberately not a JWT library: this token is minted and verified by the
same process and never parsed by anything external, so there's no algorithm
negotiation to get wrong (the usual JWT danger zone -- `alg: none`, HS/RS
confusion). It's the same idea as any framework's signed-cookie session
(e.g. Flask's default, which is HMAC signing under the hood too), built on
stdlib `hmac`/`hashlib` so this feature adds zero new dependencies.

No server-side session store on purpose -- see app/config.py's
`session_ttl_minutes` comment for why (this app's anticipated deployment
target is AWS Lambda, where in-memory/server-side state doesn't survive
between invocations). Accepted tradeoff: logout clears the cookie but can't
force-revoke it early; a stolen cookie remains valid until it naturally
expires. httpOnly + Secure + SameSite=Strict + a short TTL (set on the
cookie itself in routers/auth.py) bound that window.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time

from app.config import Settings

SCHEMA_VERSION = 1


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload_b64: str, secret: bytes) -> str:
    signature = hmac.new(secret, payload_b64.encode("ascii"), hashlib.sha256).digest()
    return _b64url_encode(signature)


def create_session_token(email: str, groups: list[str], settings: Settings) -> str:
    now = int(time.time())
    claims = {
        "email": email,
        "groups": groups,
        "iat": now,
        "exp": now + settings.session_ttl_minutes * 60,
        "jti": secrets.token_urlsafe(16),
        "v": SCHEMA_VERSION,
    }
    payload_b64 = _b64url_encode(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    secret = settings.session_secret_key.get_secret_value().encode("utf-8")
    signature_b64 = _sign(payload_b64, secret)
    return f"{payload_b64}.{signature_b64}"


def verify_session_token(token: str, settings: Settings) -> dict | None:
    """Returns the decoded claims, or None for any reason at all -- missing,
    malformed, tampered, wrong secret, expired, or an unrecognized schema
    version. Callers must never distinguish these cases from each other
    (that would leak information to an attacker); they all just mean
    "not authenticated"."""
    if not token or "." not in token:
        return None
    payload_b64, _, signature_b64 = token.partition(".")
    secret = settings.session_secret_key.get_secret_value().encode("utf-8")
    expected_signature_b64 = _sign(payload_b64, secret)
    if not hmac.compare_digest(signature_b64, expected_signature_b64):
        return None
    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:  # noqa: BLE001 -- any parse failure on attacker-controlled input means "not authenticated", never a crash
        return None
    if not isinstance(claims, dict) or claims.get("v") != SCHEMA_VERSION:
        return None
    if not isinstance(claims.get("exp"), int) or claims["exp"] < int(time.time()):
        return None
    return claims
