"""Thin wrapper around Cognito's auth API surface.

Deliberately narrow: only the actions this app actually uses (see
IMPLEMENTATION.md's Cognito IAM request list). The browser never talks to
Cognito directly; every Admin* call here is made by this backend on the
user's behalf (ALLOW_ADMIN_USER_PASSWORD_AUTH only), which is why the App
Client needs a secret and every call includes a SECRET_HASH.

ForgotPassword/ConfirmForgotPassword are the one exception: they're
Cognito *client-level* APIs, not Admin* -- AWS evaluates no IAM policy for
them at all, so they need no entry in the IAM request list.

get_cognito_client() is resolved lazily, inside route dependencies, never
at import time -- unlike app/data's get_data_source(). Cognito isn't
provisioned yet as of this writing; eager construction here would break
local dev (DATA_SOURCE=mock) and the whole test suite. Add eager startup
validation later, mirroring main.py's _validate_dynamodb_settings, once
real Cognito access actually lands.
"""

import base64
import hashlib
import hmac
import logging
from dataclasses import dataclass
from functools import lru_cache

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger("app.auth.cognito")

_CHALLENGE_KINDS = {"NEW_PASSWORD_REQUIRED", "SMS_MFA", "SOFTWARE_TOKEN_MFA"}


class InvalidCredentials(Exception):
    """Wrong username/password/code, or the user doesn't exist. Deliberately
    one exception for all of these -- the caller must not distinguish them,
    to avoid leaking which usernames are registered."""


class InvalidNewPassword(Exception):
    """The chosen new password fails Cognito's password policy. Safe to
    surface distinctly from InvalidCredentials -- unlike a wrong code or a
    nonexistent user, this reveals nothing about account existence, only
    that the password itself doesn't meet policy (true for any username)."""


class UserNotFound(Exception):
    """Admin-only lookup found no such Cognito user. Safe to surface
    distinctly -- the routes that raise this are already gated by
    require_admin, so there's no enumeration concern here."""


@dataclass
class AuthOutcome:
    authenticated: bool
    email: str | None = None
    groups: list[str] | None = None
    challenge_session: str | None = None  # Cognito's Session token; set whenever challenge_name is set
    challenge_name: str | None = None  # "NEW_PASSWORD_REQUIRED" | "SMS_MFA" | "SOFTWARE_TOKEN_MFA"


class CognitoClient:
    def __init__(self, user_pool_id: str, app_client_id: str, app_client_secret: str, region: str) -> None:
        self._user_pool_id = user_pool_id
        self._app_client_id = app_client_id
        self._app_client_secret = app_client_secret
        self._client = boto3.client("cognito-idp", region_name=region)

    def _secret_hash(self, username: str) -> str:
        message = (username + self._app_client_id).encode("utf-8")
        digest = hmac.new(self._app_client_secret.encode("utf-8"), message, hashlib.sha256).digest()
        return base64.b64encode(digest).decode("ascii")

    def _outcome_from_response(self, response: dict, username: str) -> AuthOutcome:
        challenge_name = response.get("ChallengeName")
        if challenge_name in _CHALLENGE_KINDS:
            return AuthOutcome(
                authenticated=False, challenge_session=response["Session"], challenge_name=challenge_name
            )
        if "AuthenticationResult" not in response:
            # No recognized success or challenge shape -- treat as a hard
            # failure rather than guessing.
            raise InvalidCredentials()
        groups = self.admin_list_groups_for_user(username)
        return AuthOutcome(authenticated=True, email=username, groups=groups)

    def admin_initiate_auth(self, username: str, password: str) -> AuthOutcome:
        try:
            response = self._client.admin_initiate_auth(
                UserPoolId=self._user_pool_id,
                ClientId=self._app_client_id,
                AuthFlow="ADMIN_USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": username,
                    "PASSWORD": password,
                    "SECRET_HASH": self._secret_hash(username),
                },
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NotAuthorizedException", "UserNotFoundException"):
                raise InvalidCredentials() from exc
            logger.exception("cognito_admin_initiate_auth_failed code=%s", code)
            raise
        return self._outcome_from_response(response, username)

    def admin_respond_to_new_password_challenge(
        self, username: str, new_password: str, challenge_session: str
    ) -> AuthOutcome:
        try:
            response = self._client.admin_respond_to_auth_challenge(
                UserPoolId=self._user_pool_id,
                ClientId=self._app_client_id,
                ChallengeName="NEW_PASSWORD_REQUIRED",
                Session=challenge_session,
                ChallengeResponses={
                    "USERNAME": username,
                    "NEW_PASSWORD": new_password,
                    "SECRET_HASH": self._secret_hash(username),
                },
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NotAuthorizedException", "UserNotFoundException", "CodeMismatchException"):
                raise InvalidCredentials() from exc
            logger.exception("cognito_admin_respond_to_challenge_failed code=%s", code)
            raise
        return self._outcome_from_response(response, username)

    def admin_respond_to_mfa_challenge(
        self, username: str, mfa_type: str, code: str, challenge_session: str
    ) -> AuthOutcome:
        code_key = "SMS_MFA_CODE" if mfa_type == "SMS_MFA" else "SOFTWARE_TOKEN_MFA_CODE"
        try:
            response = self._client.admin_respond_to_auth_challenge(
                UserPoolId=self._user_pool_id,
                ClientId=self._app_client_id,
                ChallengeName=mfa_type,
                Session=challenge_session,
                ChallengeResponses={
                    "USERNAME": username,
                    code_key: code,
                    "SECRET_HASH": self._secret_hash(username),
                },
            )
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in (
                "NotAuthorizedException",
                "UserNotFoundException",
                "CodeMismatchException",
                "ExpiredCodeException",
                "MFAMethodNotFoundException",
                "SoftwareTokenMFANotFoundException",
            ):
                raise InvalidCredentials() from exc
            logger.exception("cognito_admin_respond_to_mfa_challenge_failed code=%s", error_code)
            raise
        return self._outcome_from_response(response, username)

    def admin_list_groups_for_user(self, username: str) -> list[str]:
        response = self._client.admin_list_groups_for_user(
            Username=username, UserPoolId=self._user_pool_id
        )
        return [g["GroupName"] for g in response.get("Groups", [])]

    def admin_create_user(self, email: str) -> None:
        self._client.admin_create_user(
            UserPoolId=self._user_pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )

    def admin_add_user_to_group(self, email: str, group: str) -> None:
        self._client.admin_add_user_to_group(
            UserPoolId=self._user_pool_id, Username=email, GroupName=group
        )

    def forgot_password(self, username: str) -> None:
        """Fire-and-forget: normalizes an unknown username into a silent
        success, so this can never become a username-enumeration oracle
        (see routers/auth.py's forgot_password route, which always returns
        the same generic response regardless of what happens here). Any
        other error is a real operational problem, not a per-user signal,
        so it's fine for it to surface as this route's ordinary 500."""
        try:
            self._client.forgot_password(
                ClientId=self._app_client_id,
                SecretHash=self._secret_hash(username),
                Username=username,
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code == "UserNotFoundException":
                logger.info("forgot_password_unknown_user_suppressed")
                return
            logger.exception("cognito_forgot_password_failed code=%s", code)
            raise

    def confirm_forgot_password(self, username: str, confirmation_code: str, new_password: str) -> None:
        try:
            self._client.confirm_forgot_password(
                ClientId=self._app_client_id,
                SecretHash=self._secret_hash(username),
                Username=username,
                ConfirmationCode=confirmation_code,
                Password=new_password,
            )
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("InvalidPasswordException", "PasswordHistoryPolicyViolationException"):
                raise InvalidNewPassword() from exc
            if code in (
                "CodeMismatchException",
                "ExpiredCodeException",
                "UserNotFoundException",
                "NotAuthorizedException",
                "TooManyFailedAttemptsException",
            ):
                raise InvalidCredentials() from exc
            logger.exception("cognito_confirm_forgot_password_failed code=%s", code)
            raise

    def list_users(self) -> list[dict]:
        users: list[dict] = []
        kwargs: dict = {"UserPoolId": self._user_pool_id}
        while True:
            response = self._client.list_users(**kwargs)
            users.extend(response.get("Users", []))
            token = response.get("PaginationToken")
            if not token:
                break
            kwargs["PaginationToken"] = token
        return users

    def list_users_in_group(self, group: str) -> set[str]:
        usernames: set[str] = set()
        kwargs: dict = {"UserPoolId": self._user_pool_id, "GroupName": group}
        while True:
            response = self._client.list_users_in_group(**kwargs)
            usernames.update(u["Username"] for u in response.get("Users", []))
            token = response.get("NextToken")
            if not token:
                break
            kwargs["NextToken"] = token
        return usernames

    def admin_disable_user(self, username: str) -> None:
        self._admin_toggle(self._client.admin_disable_user, username)

    def admin_enable_user(self, username: str) -> None:
        self._admin_toggle(self._client.admin_enable_user, username)

    def _admin_toggle(self, method, username: str) -> None:
        try:
            method(UserPoolId=self._user_pool_id, Username=username)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code == "UserNotFoundException":
                raise UserNotFound() from exc
            logger.exception("cognito_admin_toggle_failed code=%s", code)
            raise


@lru_cache
def get_cognito_client() -> CognitoClient:
    settings = get_settings()
    if not settings.cognito_user_pool_id or not settings.cognito_app_client_id:
        raise RuntimeError(
            "Cognito is not configured -- set COGNITO_USER_POOL_ID and COGNITO_APP_CLIENT_ID"
        )
    return CognitoClient(
        user_pool_id=settings.cognito_user_pool_id,
        app_client_id=settings.cognito_app_client_id,
        app_client_secret=settings.cognito_app_client_secret.get_secret_value(),
        region=settings.aws_region,
    )
