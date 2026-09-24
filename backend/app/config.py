"""Runtime configuration, read entirely from the environment.

Nothing in this module is a secret by itself -- API keys and (if this ever
grows beyond an IAM role) AWS credentials come from the process environment
or, in a real deployment, AWS Secrets Manager. Never hard-code a real value
here.
"""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # "mock" serves deterministic sample data with no AWS dependency.
    # "dynamodb" reads the real table via the granted IAM role.
    data_source: Literal["mock", "dynamodb"] = "mock"

    # Dashboard origin allowed to call this API. Never "*" outside local dev.
    cors_allow_origin: str = "http://localhost:8000"

    rate_limit: str = "60/minute"

    log_level: str = "INFO"

    # Only read when data_source == "dynamodb".
    aws_region: str = ""
    dynamodb_table_name: str = ""

    # Static IAM-user key pair, used by DynamoDBDataSource and
    # scripts/check_aws_connection.py. SecretStr keeps the raw value out of
    # any accidental repr/log; call .get_secret_value() at the one point
    # that actually needs it.
    aws_access_key_id: str = ""
    aws_secret_access_key: SecretStr = SecretStr("")

    # "development" (default) exposes /docs, /redoc, /openapi.json.
    # "production" disables all three -- set explicitly before any
    # non-local deployment (see README, "Before any non-local deployment").
    environment: Literal["development", "production"] = "development"

    # False (default, safe) trusts only the direct TCP peer for rate
    # limiting/logging. Flip to True only once a specific reverse proxy/load
    # balancer is confirmed to sit directly in front of this app as exactly
    # one hop -- get_client_ip() then trusts the *last* X-Forwarded-For
    # entry (the one the proxy itself appended), not the first (which is
    # fully client-controlled). Re-derive, don't just flip, if a future
    # topology adds more hops (e.g. CDN + load balancer + app).
    trust_proxy_headers: bool = False

    # How long list_branches() results are cached in-process before the
    # data source is re-queried. 60s leaves a large margin under the
    # dashboard's 5-minute poll cadence while collapsing bursts of
    # concurrent/rapid requests into a single scan.
    branches_cache_ttl_seconds: float = 60.0

    # Cognito identity provider. Empty by default -- local dev and the test
    # suite never touch Cognito (see app/auth/cognito.py's module docstring).
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""
    cognito_app_client_secret: SecretStr = SecretStr("")

    # HMAC key for OUR OWN session cookie (app/auth/session.py) -- not a
    # Cognito credential. Rotating this immediately logs out every active
    # session. Must be a long random value in any real deployment; the dev
    # default below is intentionally obvious and checked for at startup
    # (see main.py's _validate_session_secret) when environment=production.
    session_secret_key: SecretStr = SecretStr("dev-local-session-secret-change-me")

    # How long a session cookie is valid. Short on purpose: there is no
    # server-side revocation (see app/auth/session.py's module docstring),
    # so this TTL is what bounds a stolen-cookie exposure window.
    session_ttl_minutes: int = 30

    # Tighter than the general rate_limit -- /api/auth/login is the one
    # endpoint brute-forcing/credential-stuffing actually gains anything from.
    login_rate_limit: str = "5/minute"

    # Demo-only shortcut for showing the dashboard before a real Cognito
    # pool exists (see app/routers/auth.py's _demo_login). False by default
    # -- must be explicitly turned on for a demo deployment, never in a real
    # one. Delete this and _demo_login once Cognito is provisioned; nothing
    # else in the auth code changes.
    demo_mode: bool = False
    demo_username: str = ""
    demo_password: SecretStr = SecretStr("")

    # Serves tngb-dashboard's static files from this same FastAPI app when
    # true, so a demo can be deployed as one service instead of two. See
    # main.py. Independent of demo_mode (you could serve the real dashboard
    # this way too), but in practice only turned on together for the V1 demo.
    serve_dashboard_static: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
