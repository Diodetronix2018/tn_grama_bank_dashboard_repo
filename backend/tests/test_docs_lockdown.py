import importlib

from fastapi.testclient import TestClient

from app.main import _docs_kwargs


def test_docs_kwargs_development():
    assert _docs_kwargs("development") == {
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "openapi_url": "/openapi.json",
    }


def test_docs_kwargs_production():
    assert _docs_kwargs("production") == {"docs_url": None, "redoc_url": None, "openapi_url": None}


def test_docs_reachable_by_default():
    import app.main as main_module

    client = TestClient(main_module.app)
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_docs_disabled_when_environment_is_production(monkeypatch):
    import app.main as main_module
    from app.config import get_settings
    from app.data import get_data_source

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SESSION_SECRET_KEY", "x" * 40)  # else _validate_session_secret blocks the reload
    get_settings.cache_clear()
    try:
        importlib.reload(main_module)
        client = TestClient(main_module.app)
        assert client.get("/docs").status_code == 404
        assert client.get("/redoc").status_code == 404
        assert client.get("/openapi.json").status_code == 404
    finally:
        get_settings.cache_clear()
        get_data_source.cache_clear()
        importlib.reload(main_module)
