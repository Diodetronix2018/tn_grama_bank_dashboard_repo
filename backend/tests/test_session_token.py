from app.auth.session import create_session_token, verify_session_token
from app.config import Settings


def _settings(**overrides) -> Settings:
    base = {"session_secret_key": "test-secret-key-please-ignore", "session_ttl_minutes": 30}
    base.update(overrides)
    return Settings(**base)


def test_round_trip_returns_same_claims():
    settings = _settings()
    token = create_session_token("alice@example.com", ["admins"], settings)
    claims = verify_session_token(token, settings)
    assert claims is not None
    assert claims["email"] == "alice@example.com"
    assert claims["groups"] == ["admins"]


def test_tampered_signature_rejected():
    settings = _settings()
    token = create_session_token("alice@example.com", [], settings)
    payload, _, signature = token.partition(".")
    tampered = payload + "." + signature[:-1] + ("A" if signature[-1] != "A" else "B")
    assert verify_session_token(tampered, settings) is None


def test_tampered_payload_rejected():
    settings = _settings()
    token = create_session_token("alice@example.com", [], settings)
    payload, _, signature = token.partition(".")
    tampered = payload[:-1] + ("A" if payload[-1] != "A" else "B") + "." + signature
    assert verify_session_token(tampered, settings) is None


def test_expired_token_rejected(monkeypatch):
    settings = _settings(session_ttl_minutes=1)
    fake_now = [1_000_000.0]
    monkeypatch.setattr("app.auth.session.time.time", lambda: fake_now[0])
    token = create_session_token("alice@example.com", [], settings)
    fake_now[0] += 61.0
    assert verify_session_token(token, settings) is None


def test_wrong_secret_rejected():
    signing_settings = _settings(session_secret_key="secret-one")
    verifying_settings = _settings(session_secret_key="secret-two")
    token = create_session_token("alice@example.com", [], signing_settings)
    assert verify_session_token(token, verifying_settings) is None


def test_malformed_token_rejected():
    settings = _settings()
    assert verify_session_token("not-a-real-token", settings) is None
    assert verify_session_token("", settings) is None
    assert verify_session_token(None, settings) is None
    assert verify_session_token("a.b.c", settings) is None
