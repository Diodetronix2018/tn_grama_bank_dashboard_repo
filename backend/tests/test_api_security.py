import logging

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import get_settings
from app.main import app
from app.security import get_client_ip

client = TestClient(app)
HEADERS = {"X-API-Key": "dev-local-key-change-me"}


def test_missing_key_is_rejected():
    response = client.get("/api/branches")
    assert response.status_code == 401


def test_wrong_key_is_rejected():
    response = client.get("/api/branches", headers={"X-API-Key": "not-the-right-key"})
    assert response.status_code == 401


def test_cors_blocks_other_origins():
    response = client.get(
        "/api/branches",
        headers={"X-API-Key": "dev-local-key-change-me", "Origin": "https://not-the-dashboard.example"},
    )
    # The request still succeeds server-side (CORS is enforced by the browser,
    # not the server) but the response must not grant that origin access.
    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_configured_origin():
    response = client.get(
        "/api/branches",
        headers={"X-API-Key": "dev-local-key-change-me", "Origin": "http://localhost:8000"},
    )
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8000"


def test_security_headers_present():
    response = client.get("/health")
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "no-referrer"
    assert "max-age" in response.headers.get("strict-transport-security", "")


def test_response_echoes_generated_request_id_header():
    response = client.get("/health")
    request_id = response.headers.get("x-request-id")
    assert request_id
    assert len(request_id) > 0


def test_response_echoes_client_supplied_request_id():
    response = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert response.headers.get("x-request-id") == "abc-123"


def test_malformed_request_id_header_is_replaced():
    response = client.get("/health", headers={"X-Request-ID": "not valid; has spaces"})
    request_id = response.headers.get("x-request-id")
    assert request_id != "not valid; has spaces"


def test_request_id_appears_in_logs(caplog):
    with caplog.at_level(logging.INFO, logger="app.main"):
        response = client.get("/health", headers={"X-Request-ID": "log-check-1"})
    assert response.headers.get("x-request-id") == "log-check-1"
    assert any("request_id=log-check-1" in record.message for record in caplog.records)


def test_get_client_ip_uses_remote_address_by_default():
    scope = {
        "type": "http",
        "client": ("1.2.3.4", 1234),
        "headers": [(b"x-forwarded-for", b"9.9.9.9")],
    }
    request = Request(scope)
    assert get_client_ip(request) == "1.2.3.4"


def test_get_client_ip_trusts_last_forwarded_for_entry_when_enabled(monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    get_settings.cache_clear()
    try:
        scope = {
            "type": "http",
            "client": ("1.2.3.4", 1234),
            "headers": [(b"x-forwarded-for", b"7.7.7.7, 9.9.9.9")],
        }
        request = Request(scope)
        assert get_client_ip(request) == "9.9.9.9"
    finally:
        get_settings.cache_clear()
