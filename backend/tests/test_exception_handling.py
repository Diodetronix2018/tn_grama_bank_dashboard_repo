from fastapi.testclient import TestClient

from app.auth.session import create_session_token
from app.config import get_settings
from app.data import get_data_source
from app.data.base import DataSource
from app.main import app

client = TestClient(app, raise_server_exceptions=False)
COOKIES = {"tngb_session": create_session_token("test@example.com", [], get_settings())}


class _BoomSource(DataSource):
    def list_branches(self):
        raise RuntimeError("boom, some internal detail that must not leak")


def test_unhandled_exception_returns_generic_500_json():
    app.dependency_overrides[get_data_source] = lambda: _BoomSource()
    try:
        response = client.get("/api/branches", cookies=COOKIES)
    finally:
        app.dependency_overrides.pop(get_data_source, None)

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "boom" not in response.text
    assert "RuntimeError" not in response.text


def test_unhandled_exception_response_has_cors_and_request_id_headers():
    app.dependency_overrides[get_data_source] = lambda: _BoomSource()
    try:
        response = client.get(
            "/api/branches",
            cookies=COOKIES,
            headers={"Origin": "http://localhost:8000"},
        )
    finally:
        app.dependency_overrides.pop(get_data_source, None)

    assert response.headers.get("access-control-allow-origin") == "http://localhost:8000"
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert response.headers.get("x-request-id")
