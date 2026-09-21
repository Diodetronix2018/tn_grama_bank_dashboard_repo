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

    # Comma-separated list of accepted API keys. Rotate by adding a new key
    # and removing the old one on the next deploy -- never reuse a leaked key.
    api_keys: str = "dev-local-key-change-me"

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

    @property
    def api_key_set(self) -> set[str]:
        return {k.strip() for k in self.api_keys.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
