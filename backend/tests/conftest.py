import os

# Must be set before app.main is first imported by any test module: main.py
# now validates/constructs its data source eagerly at import time (see its
# startup validation), so a per-test fixture would run too late to prevent a
# real AWS call. pytest imports conftest.py before collecting test modules,
# so this line runs first regardless of what's in a developer's local .env
# (real OS env vars outrank the .env file in pydantic-settings' resolution).
os.environ["DATA_SOURCE"] = "mock"

import pytest

from app.config import get_settings
from app.security import limiter


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Settings is read fresh per-request via Depends(get_settings) -- clear
    its cache around every test so a test that monkeypatches an env var
    (e.g. ENVIRONMENT) can't leak its resolved Settings into the next test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """slowapi's Limiter is in-memory and keyed by client IP -- every
    TestClient request looks like it comes from the same IP, so without
    this a login-rate-limit test would leak its count into every other
    test in the same process that happens to hit a rate-limited route."""
    limiter.reset()
    yield
    limiter.reset()
