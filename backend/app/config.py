"""Runtime configuration, read entirely from the environment.

Nothing in this module is a secret by itself -- API keys and (if this ever
grows beyond an IAM role) AWS credentials come from the process environment
or, in a real deployment, AWS Secrets Manager. Never hard-code a real value
here.
"""

from functools import lru_cache
from typing import Literal

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

    @property
    def api_key_set(self) -> set[str]:
        return {k.strip() for k in self.api_keys.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
