from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.auth.cognito import AuthOutcome, InvalidCredentials, InvalidNewPassword, UserNotFound
from app.auth.session import create_session_token
from app.config import get_settings
from app.main import app

_FAKE_USERS = [
    {
        "Username": "alice@example.com",
        "UserStatus": "CONFIRMED",
        "Enabled": True,
        "UserCreateDate": datetime(2026, 1, 1, tzinfo=UTC),
        "Attributes": [{"Name": "email", "Value": "alice@example.com"}],
    },
    {
        "Username": "admin@example.com",
        "UserStatus": "CONFIRMED",
        "Enabled": True,
        "UserCreateDate": datetime(2026, 1, 2, tzinfo=UTC),
        "Attributes": [{"Name": "email", "Value": "admin@example.com"}],
    },
]


class _FakeCognitoClient:
    def __init__(self):
        self.created_users = []
        self.group_adds = []
        self.disabled = set()
        self.enabled = {"alice@example.com", "admin@example.com"}

    def admin_initiate_auth(self, username, password):
        if username == "bad@example.com":
            raise InvalidCredentials()
        if username == "newuser@example.com":
            return AuthOutcome(
                authenticated=False, challenge_session="fake-challenge-session",
                challenge_name="NEW_PASSWORD_REQUIRED",
            )
        if username == "mfa@example.com":
            return AuthOutcome(
                authenticated=False, challenge_session="fake-mfa-session", challenge_name="SMS_MFA",
            )
        return AuthOutcome(authenticated=True, email=username, groups=["admins"] if username == "admin@example.com" else [])

    def admin_respond_to_new_password_challenge(self, username, new_password, challenge_session):
        if challenge_session != "fake-challenge-session":
            raise InvalidCredentials()
        return AuthOutcome(authenticated=True, email=username, groups=[])

    def admin_respond_to_mfa_challenge(self, username, mfa_type, code, challenge_session):
        if code != "000000":
            raise InvalidCredentials()
        return AuthOutcome(authenticated=True, email=username, groups=[])

    def forgot_password(self, username):
        return None  # Real client silently succeeds for unknown users too.

    def confirm_forgot_password(self, username, confirmation_code, new_password):
        if new_password == "weak":
            raise InvalidNewPassword()
        if confirmation_code != "123456":
            raise InvalidCredentials()

    def admin_create_user(self, email):
        self.created_users.append(email)

    def admin_add_user_to_group(self, email, group):
        self.group_adds.append((email, group))

    def admin_list_groups_for_user(self, username):
        return ["admins"] if username == "admin@example.com" else []

    def list_users(self):
        return _FAKE_USERS

    def list_users_in_group(self, group):
        return {"admin@example.com"} if group == "admins" else set()

    def admin_disable_user(self, username):
        if username == "nobody@example.com":
            raise UserNotFound()
        self.disabled.add(username)
        self.enabled.discard(username)

    def admin_enable_user(self, username):
        if username == "nobody@example.com":
            raise UserNotFound()
        self.enabled.add(username)
        self.disabled.discard(username)


def _client():
    from app.auth.cognito import get_cognito_client

    fake = _FakeCognitoClient()
    app.dependency_overrides[get_cognito_client] = lambda: fake
    # https:// base_url so httpx's cookie jar treats this as a secure
    # context and actually resends our Secure-flagged session cookie on
    # follow-up requests -- same as a real browser would; with the default
    # http://testserver base_url the jar (correctly) withholds it.
    client = TestClient(app, base_url="https://testserver")
    client.cognito = fake
    return client


def _teardown(client):
    from app.auth.cognito import get_cognito_client

    app.dependency_overrides.pop(get_cognito_client, None)
    client.close()


def test_login_success_sets_cookie():
    client = _client()
    try:
        response = client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        assert response.status_code == 200
        assert response.json()["email"] == "alice@example.com"
        assert "tngb_session" in response.cookies
    finally:
        _teardown(client)


def test_login_new_password_required_no_cookie():
    client = _client()
    try:
        response = client.post("/api/auth/login", json={"username": "newuser@example.com", "password": "x"})
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "new_password_required"
        assert body["session"] == "fake-challenge-session"
        assert "tngb_session" not in response.cookies
    finally:
        _teardown(client)


def test_login_invalid_credentials_rejected():
    client = _client()
    try:
        response = client.post("/api/auth/login", json={"username": "bad@example.com", "password": "x"})
        assert response.status_code == 401
        assert "tngb_session" not in response.cookies
    finally:
        _teardown(client)


def test_complete_new_password_success():
    client = _client()
    try:
        response = client.post(
            "/api/auth/complete-new-password",
            json={"username": "newuser@example.com", "new_password": "NewPass123!", "session": "fake-challenge-session"},
        )
        assert response.status_code == 200
        assert "tngb_session" in response.cookies
    finally:
        _teardown(client)


def test_login_mfa_required_no_cookie():
    client = _client()
    try:
        response = client.post("/api/auth/login", json={"username": "mfa@example.com", "password": "x"})
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "mfa_required"
        assert body["mfa_type"] == "SMS_MFA"
        assert body["session"] == "fake-mfa-session"
        assert "tngb_session" not in response.cookies
    finally:
        _teardown(client)


def test_complete_mfa_success():
    client = _client()
    try:
        response = client.post(
            "/api/auth/complete-mfa",
            json={"username": "mfa@example.com", "mfa_type": "SMS_MFA", "code": "000000", "session": "fake-mfa-session"},
        )
        assert response.status_code == 200
        assert "tngb_session" in response.cookies
    finally:
        _teardown(client)


def test_complete_mfa_wrong_code_rejected():
    client = _client()
    try:
        response = client.post(
            "/api/auth/complete-mfa",
            json={"username": "mfa@example.com", "mfa_type": "SMS_MFA", "code": "111111", "session": "fake-mfa-session"},
        )
        assert response.status_code == 401
        assert "tngb_session" not in response.cookies
    finally:
        _teardown(client)


def test_non_mfa_login_unaffected():
    client = _client()
    try:
        response = client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert "tngb_session" in response.cookies
    finally:
        _teardown(client)


def test_forgot_password_same_response_for_known_and_unknown_username():
    client = _client()
    try:
        known = client.post("/api/auth/forgot-password", json={"username": "alice@example.com"})
        unknown = client.post("/api/auth/forgot-password", json={"username": "definitely-not-a-user@example.com"})
        assert known.status_code == unknown.status_code == 200
        assert known.json() == unknown.json()
    finally:
        _teardown(client)


def test_confirm_forgot_password_success():
    client = _client()
    try:
        response = client.post(
            "/api/auth/confirm-forgot-password",
            json={"username": "alice@example.com", "confirmation_code": "123456", "new_password": "NewPass123!"},
        )
        assert response.status_code == 200
    finally:
        _teardown(client)


def test_confirm_forgot_password_bad_code_rejected():
    client = _client()
    try:
        response = client.post(
            "/api/auth/confirm-forgot-password",
            json={"username": "alice@example.com", "confirmation_code": "000000", "new_password": "NewPass123!"},
        )
        assert response.status_code == 401
    finally:
        _teardown(client)


def test_confirm_forgot_password_weak_password_rejected():
    client = _client()
    try:
        response = client.post(
            "/api/auth/confirm-forgot-password",
            json={"username": "alice@example.com", "confirmation_code": "123456", "new_password": "weak"},
        )
        assert response.status_code == 400
    finally:
        _teardown(client)


def test_logout_always_succeeds_and_clears_cookie():
    client = _client()
    try:
        client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        response = client.post("/api/auth/logout")
        assert response.status_code == 200
        assert client.cookies.get("tngb_session") is None
    finally:
        _teardown(client)


def test_me_requires_valid_session():
    client = _client()
    try:
        assert client.get("/api/auth/me").status_code == 401
        client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        response = client.get("/api/auth/me")
        assert response.status_code == 200
        assert response.json()["email"] == "alice@example.com"
    finally:
        _teardown(client)


def test_users_requires_admin():
    client = _client()
    try:
        # Not logged in at all.
        assert client.post("/api/auth/users", json={"email": "new@example.com"}).status_code == 401

        # Logged in but not an admin.
        client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        assert client.post("/api/auth/users", json={"email": "new@example.com"}).status_code == 403

        # Logged in as an admin.
        client.cookies.clear()
        client.post("/api/auth/login", json={"username": "admin@example.com", "password": "x"})
        response = client.post("/api/auth/users", json={"email": "new@example.com", "is_admin": True})
        assert response.status_code == 201
        assert "new@example.com" in client.cognito.created_users
        assert ("new@example.com", "admins") in client.cognito.group_adds
    finally:
        _teardown(client)


def test_list_users_requires_admin_and_returns_trimmed_shape():
    client = _client()
    try:
        assert client.get("/api/auth/users").status_code == 401

        client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        assert client.get("/api/auth/users").status_code == 403

        client.cookies.clear()
        client.post("/api/auth/login", json={"username": "admin@example.com", "password": "x"})
        response = client.get("/api/auth/users")
        assert response.status_code == 200
        users = response.json()["users"]
        assert {u["email"] for u in users} == {"alice@example.com", "admin@example.com"}
        alice = next(u for u in users if u["email"] == "alice@example.com")
        assert set(alice.keys()) == {"email", "status", "enabled", "created_at", "groups"}
        assert alice["groups"] == []
        admin = next(u for u in users if u["email"] == "admin@example.com")
        assert admin["groups"] == ["admins"]
    finally:
        _teardown(client)


def test_disable_and_enable_user_requires_admin():
    client = _client()
    try:
        assert client.post("/api/auth/users/alice@example.com/disable").status_code == 401

        client.post("/api/auth/login", json={"username": "admin@example.com", "password": "x"})
        response = client.post("/api/auth/users/alice@example.com/disable")
        assert response.status_code == 200
        assert "alice@example.com" in client.cognito.disabled

        response = client.post("/api/auth/users/alice@example.com/enable")
        assert response.status_code == 200
        assert "alice@example.com" in client.cognito.enabled
    finally:
        _teardown(client)


def test_disable_unknown_user_is_404():
    client = _client()
    try:
        client.post("/api/auth/login", json={"username": "admin@example.com", "password": "x"})
        response = client.post("/api/auth/users/nobody@example.com/disable")
        assert response.status_code == 404
    finally:
        _teardown(client)


def test_branches_endpoint_requires_session():
    client = _client()
    try:
        assert client.get("/api/branches").status_code == 401
        client.post("/api/auth/login", json={"username": "alice@example.com", "password": "x"})
        assert client.get("/api/branches").status_code == 200
    finally:
        _teardown(client)


def test_tampered_cookie_rejected():
    client = _client()
    try:
        settings = get_settings()
        token = create_session_token("alice@example.com", [], settings)
        client.cookies.set("tngb_session", token + "tampered")
        assert client.get("/api/auth/me").status_code == 401
    finally:
        _teardown(client)


def test_login_rate_limited_after_five_attempts():
    client = _client()
    try:
        for _ in range(5):
            response = client.post("/api/auth/login", json={"username": "bad@example.com", "password": "x"})
            assert response.status_code == 401
        response = client.post("/api/auth/login", json={"username": "bad@example.com", "password": "x"})
        assert response.status_code == 429
    finally:
        _teardown(client)
