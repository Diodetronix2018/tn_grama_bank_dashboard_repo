from fastapi.testclient import TestClient

from app.auth.session import create_session_token
from app.config import get_settings
from app.main import app

client = TestClient(app)
COOKIES = {"tngb_session": create_session_token("test@example.com", [], get_settings())}


def test_health_needs_no_key():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_list_branches_with_valid_key():
    response = client.get("/api/branches", cookies=COOKIES)
    assert response.status_code == 200
    body = response.json()
    assert body["count"] > 0
    assert body["count"] == len(body["branches"])
    assert body["source"] == "mock"


def test_get_one_branch():
    listed = client.get("/api/branches", cookies=COOKIES).json()["branches"]
    branch_id = listed[0]["id"]

    response = client.get(f"/api/branches/{branch_id}", cookies=COOKIES)
    assert response.status_code == 200
    assert response.json()["id"] == branch_id


def test_get_unknown_branch_is_404():
    response = client.get("/api/branches/does-not-exist", cookies=COOKIES)
    assert response.status_code == 404
