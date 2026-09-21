import threading
import time
from functools import lru_cache

from app.config import get_settings
from app.data.base import DataSource
from app.data.mock_source import MockDataSource
from app.models import Branch


class CachedDataSource(DataSource):
    """Short-TTL wrapper around any DataSource.

    The frontend already polls every 5 minutes; without this, every request
    (including bursts of concurrent/rapid ones) triggers a full re-scan of
    the wrapped source. Single-process, in-memory -- same tradeoff as the
    rate limiter (app/security.py): does not coordinate across multiple
    worker processes, resets on restart. Accepted for now; revisit if this
    ever runs with multiple uvicorn workers.
    """

    def __init__(self, wrapped: DataSource, ttl_seconds: float) -> None:
        self._wrapped = wrapped
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._cached: list[Branch] | None = None
        self._cached_at: float | None = None

    def list_branches(self) -> list[Branch]:
        with self._lock:
            now = time.monotonic()
            if (
                self._cached is not None
                and self._cached_at is not None
                and (now - self._cached_at) < self._ttl_seconds
            ):
                return self._cached
            self._cached = self._wrapped.list_branches()
            self._cached_at = now
            return self._cached

    @property
    def cache_age_seconds(self) -> float | None:
        return None if self._cached_at is None else time.monotonic() - self._cached_at


@lru_cache
def get_data_source() -> DataSource:
    settings = get_settings()
    if settings.data_source == "dynamodb":
        # Imported lazily so `boto3` is only required when actually used --
        # the mock path (used in tests and local dev) has no AWS dependency.
        from app.data.dynamodb_source import DynamoDBDataSource

        real_source: DataSource = DynamoDBDataSource(
            table_name=settings.dynamodb_table_name,
            region=settings.aws_region,
            access_key_id=settings.aws_access_key_id,
            secret_access_key=settings.aws_secret_access_key.get_secret_value(),
        )
    else:
        real_source = MockDataSource()
    return CachedDataSource(real_source, ttl_seconds=settings.branches_cache_ttl_seconds)
