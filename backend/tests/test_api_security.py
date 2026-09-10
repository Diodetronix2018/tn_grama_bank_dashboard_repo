from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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
