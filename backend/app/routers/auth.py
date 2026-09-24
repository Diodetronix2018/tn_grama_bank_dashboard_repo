import logging
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.auth.cognito import (
    CognitoClient,
    InvalidCredentials,
    InvalidNewPassword,
    UserNotFound,
    get_cognito_client,
)
from app.auth.session import create_session_token
from app.config import Settings, get_settings
from app.security import limiter, require_admin, require_session

logger = logging.getLogger("app.routers.auth")

router = APIRouter(prefix="/api/auth")

COOKIE_NAME = "tngb_session"


class LoginRequest(BaseModel):
    username: str
    password: str


class CompleteNewPasswordRequest(BaseModel):
    username: str
    new_password: str
    session: str


class CompleteMfaRequest(BaseModel):
    username: str
    mfa_type: Literal["SMS_MFA", "SOFTWARE_TOKEN_MFA"]
    code: str
    session: str


class ForgotPasswordRequest(BaseModel):
    username: str


class ConfirmForgotPasswordRequest(BaseModel):
    username: str
    confirmation_code: str
    new_password: str


class CreateUserRequest(BaseModel):
    email: str
    is_admin: bool = False


def _set_session_cookie(response: Response, email: str, groups: list[str], settings: Settings) -> None:
    token = create_session_token(email, groups, settings)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.session_ttl_minutes * 60,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )


def _auth_response(response: Response, outcome, settings: Settings) -> dict:
    if outcome.challenge_name == "NEW_PASSWORD_REQUIRED":
        return {"status": "new_password_required", "session": outcome.challenge_session}
    if outcome.challenge_name in ("SMS_MFA", "SOFTWARE_TOKEN_MFA"):
        return {"status": "mfa_required", "mfa_type": outcome.challenge_name, "session": outcome.challenge_session}
    _set_session_cookie(response, outcome.email, outcome.groups or [], settings)
    return {"status": "ok", "email": outcome.email, "groups": outcome.groups or []}


def _demo_login(body: LoginRequest, response: Response, settings: Settings) -> dict:
    """Demo-only shortcut: issues the same signed session cookie the real
    Cognito flow issues, without calling Cognito at all. Only reachable
    when settings.demo_mode is True. Delete this function and its call site
    in login() once a real Cognito pool is provisioned -- nothing else in
    this file (or app/auth/cognito.py, app/auth/session.py) needs to change."""
    if (
        settings.demo_username
        and body.username == settings.demo_username
        and body.password == settings.demo_password.get_secret_value()
    ):
        _set_session_cookie(response, body.username, ["admins"], settings)
        return {"status": "ok", "email": body.username, "groups": ["admins"]}
    logger.warning("login_failed username=%s", body.username)
    response.status_code = 401
    return {"detail": "Invalid username or password"}


@router.post("/login")
@limiter.limit(lambda: get_settings().login_rate_limit)
def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    cognito: CognitoClient = Depends(get_cognito_client),
    settings: Settings = Depends(get_settings),
):
    if settings.demo_mode:
        return _demo_login(body, response, settings)
    try:
        outcome = cognito.admin_initiate_auth(body.username, body.password)
    except InvalidCredentials:
        logger.warning("login_failed username=%s", body.username)
        response.status_code = 401
        return {"detail": "Invalid username or password"}
    return _auth_response(response, outcome, settings)


@router.post("/complete-new-password")
@limiter.limit(lambda: get_settings().login_rate_limit)
def complete_new_password(
    request: Request,
    body: CompleteNewPasswordRequest,
    response: Response,
    cognito: CognitoClient = Depends(get_cognito_client),
    settings: Settings = Depends(get_settings),
):
    try:
        outcome = cognito.admin_respond_to_new_password_challenge(
            body.username, body.new_password, body.session
        )
    except InvalidCredentials:
        logger.warning("complete_new_password_failed username=%s", body.username)
        response.status_code = 401
        return {"detail": "Could not complete the password change"}
    return _auth_response(response, outcome, settings)


@router.post("/complete-mfa")
@limiter.limit(lambda: get_settings().login_rate_limit)
def complete_mfa(
    request: Request,
    body: CompleteMfaRequest,
    response: Response,
    cognito: CognitoClient = Depends(get_cognito_client),
    settings: Settings = Depends(get_settings),
):
    try:
        outcome = cognito.admin_respond_to_mfa_challenge(body.username, body.mfa_type, body.code, body.session)
    except InvalidCredentials:
        logger.warning("complete_mfa_failed username=%s", body.username)
        response.status_code = 401
        return {"detail": "Invalid or expired MFA code"}
    return _auth_response(response, outcome, settings)


@router.post("/forgot-password")
@limiter.limit(lambda: get_settings().login_rate_limit)
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    cognito: CognitoClient = Depends(get_cognito_client),
):
    cognito.forgot_password(body.username)
    logger.info("forgot_password_requested username=%s", body.username)
    return {"status": "ok", "detail": "If that account exists, a reset code has been sent to its email."}


@router.post("/confirm-forgot-password")
@limiter.limit(lambda: get_settings().login_rate_limit)
def confirm_forgot_password(
    request: Request,
    body: ConfirmForgotPasswordRequest,
    response: Response,
    cognito: CognitoClient = Depends(get_cognito_client),
):
    try:
        cognito.confirm_forgot_password(body.username, body.confirmation_code, body.new_password)
    except InvalidNewPassword:
        response.status_code = 400
        return {"detail": "Password must be 12+ characters with upper/lower/number/symbol."}
    except InvalidCredentials:
        logger.warning("confirm_forgot_password_failed username=%s", body.username)
        response.status_code = 401
        return {"detail": "Invalid or expired reset code."}
    logger.info("password_reset_completed username=%s", body.username)
    return {"status": "ok"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/", httponly=True, secure=True, samesite="strict")
    return {"status": "ok"}


@router.get("/me")
def me(request: Request, _: None = Depends(require_session)):
    claims = request.state.session_claims
    return {"email": claims["email"], "groups": claims.get("groups") or []}


@router.post("/users", status_code=201)
def create_user(
    body: CreateUserRequest,
    _: None = Depends(require_admin),
    cognito: CognitoClient = Depends(get_cognito_client),
):
    cognito.admin_create_user(body.email)
    if body.is_admin:
        cognito.admin_add_user_to_group(body.email, "admins")
    logger.info("user_created email=%s is_admin=%s", body.email, body.is_admin)
    return {"status": "created", "email": body.email}


def _shape_user(raw: dict, admin_usernames: set[str]) -> dict:
    attrs = {a["Name"]: a["Value"] for a in raw.get("Attributes", [])}
    return {
        "email": attrs.get("email", raw["Username"]),
        "status": raw["UserStatus"],
        "enabled": raw["Enabled"],
        "created_at": raw["UserCreateDate"].isoformat() if hasattr(raw["UserCreateDate"], "isoformat") else raw["UserCreateDate"],
        "groups": ["admins"] if raw["Username"] in admin_usernames else [],
    }


@router.get("/users")
def list_users(_: None = Depends(require_admin), cognito: CognitoClient = Depends(get_cognito_client)):
    admin_usernames = cognito.list_users_in_group("admins")
    return {"users": [_shape_user(u, admin_usernames) for u in cognito.list_users()]}


@router.post("/users/{username}/disable")
def disable_user(
    username: str,
    response: Response,
    _: None = Depends(require_admin),
    cognito: CognitoClient = Depends(get_cognito_client),
):
    try:
        cognito.admin_disable_user(username)
    except UserNotFound:
        response.status_code = 404
        return {"detail": f"No such user '{username}'"}
    logger.info("user_disabled username=%s", username)
    return {"status": "ok"}


@router.post("/users/{username}/enable")
def enable_user(
    username: str,
    response: Response,
    _: None = Depends(require_admin),
    cognito: CognitoClient = Depends(get_cognito_client),
):
    try:
        cognito.admin_enable_user(username)
    except UserNotFound:
        response.status_code = 404
        return {"detail": f"No such user '{username}'"}
    logger.info("user_enabled username=%s", username)
    return {"status": "ok"}
