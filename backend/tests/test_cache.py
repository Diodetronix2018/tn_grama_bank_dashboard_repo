from app.data import CachedDataSource
from app.data.base import DataSource


class _CountingSource(DataSource):
    def __init__(self):
        self.calls = 0

    def list_branches(self):
        self.calls += 1
        return []


def test_cache_hit_within_ttl():
    inner = _CountingSource()
    cached = CachedDataSource(inner, ttl_seconds=60.0)
    cached.list_branches()
    cached.list_branches()
    assert inner.calls == 1


def test_cache_refetches_after_ttl_expires(monkeypatch):
    inner = _CountingSource()
    cached = CachedDataSource(inner, ttl_seconds=60.0)

    fake_now = [1000.0]
    monkeypatch.setattr("app.data.time.monotonic", lambda: fake_now[0])

    cached.list_branches()
    fake_now[0] += 61.0
    cached.list_branches()
    assert inner.calls == 2


def test_cache_age_seconds_none_before_first_fetch():
    cached = CachedDataSource(_CountingSource(), ttl_seconds=60.0)
    assert cached.cache_age_seconds is None


def test_cache_age_seconds_reported_after_fetch():
    cached = CachedDataSource(_CountingSource(), ttl_seconds=60.0)
    cached.list_branches()
    assert cached.cache_age_seconds is not None
    assert cached.cache_age_seconds >= 0
