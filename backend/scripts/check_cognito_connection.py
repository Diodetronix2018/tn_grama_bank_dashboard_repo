"""One-off connectivity check for the Cognito User Pool used for dashboard
login (see IMPLEMENTATION.md for what was requested from the AWS admin).

Deliberately standalone: does not import the FastAPI app, does not touch a
running server, and uses only read-only DescribeUserPool/DescribeUserPoolClient
calls -- it never creates a user or attempts a real login. Its only job is
to answer "is the User Pool/App Client reachable and configured as expected."

Run from backend/ with the venv active:

    python -m scripts.check_cognito_connection
"""

import sys

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings


def main() -> int:
    settings = get_settings()

    missing = []
    if not settings.cognito_user_pool_id:
        missing.append("COGNITO_USER_POOL_ID")
    if not settings.cognito_app_client_id:
        missing.append("COGNITO_APP_CLIENT_ID")
    if not settings.cognito_app_client_secret.get_secret_value():
        missing.append("COGNITO_APP_CLIENT_SECRET")
    if not settings.aws_region:
        missing.append("AWS_REGION")
    if missing:
        print("FAILED: missing required settings in backend/.env: " + ", ".join(missing))
        print("Fill these in once the User Pool/App Client have been provisioned, then rerun.")
        return 1

    print("Checking Cognito connectivity...")
    print(f"  Region:          {settings.aws_region}")
    print(f"  User Pool ID:    {settings.cognito_user_pool_id}")
    print(f"  App Client ID:   {settings.cognito_app_client_id}")
    print()

    session = boto3.Session(
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key.get_secret_value(),
        region_name=settings.aws_region,
    )
    cognito = session.client("cognito-idp")

    try:
        pool = cognito.describe_user_pool(UserPoolId=settings.cognito_user_pool_id)["UserPool"]
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        message = exc.response.get("Error", {}).get("Message", str(exc))
        if code == "ResourceNotFoundException":
            print(f"FAILED: User Pool '{settings.cognito_user_pool_id}' was not found in region '{settings.aws_region}'.")
            print("Check COGNITO_USER_POOL_ID and AWS_REGION in backend/.env.")
        elif code == "AccessDeniedException":
            print("FAILED: credentials are valid but cannot call DescribeUserPool on this User Pool.")
            print("Check the IAM policy grants cognito-idp:DescribeUserPool on this pool's ARN.")
        else:
            print(f"FAILED: Cognito rejected the User Pool check ({code}: {message}).")
        return 1
    except BotoCoreError as exc:
        print(f"FAILED: could not reach AWS ({exc}).")
        return 1

    print("Step 1/2 OK -- User Pool reachable.")
    print(f"  Name:   {pool.get('Name')}")
    print(f"  Status: {pool.get('Status', 'n/a')}")
    print()

    try:
        client_config = cognito.describe_user_pool_client(
            UserPoolId=settings.cognito_user_pool_id,
            ClientId=settings.cognito_app_client_id,
        )["UserPoolClient"]
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        message = exc.response.get("Error", {}).get("Message", str(exc))
        if code == "ResourceNotFoundException":
            print(f"FAILED: App Client '{settings.cognito_app_client_id}' was not found on this User Pool.")
            print("Check COGNITO_APP_CLIENT_ID in backend/.env.")
        else:
            print(f"FAILED: Cognito rejected the App Client check ({code}: {message}).")
        return 1
    except BotoCoreError as exc:
        print(f"FAILED: could not reach AWS ({exc}).")
        return 1

    auth_flows = client_config.get("ExplicitAuthFlows", [])
    has_secret = bool(client_config.get("ClientSecret"))
    print("Step 2/2 OK -- App Client reachable.")
    print(f"  Auth flows enabled: {', '.join(auth_flows) if auth_flows else '(none)'}")
    print(f"  Has a client secret: {has_secret}")
    if "ALLOW_ADMIN_USER_PASSWORD_AUTH" not in auth_flows:
        print("  WARNING: ALLOW_ADMIN_USER_PASSWORD_AUTH is not enabled -- login will fail until it is.")
    if not has_secret:
        print("  WARNING: this App Client has no secret -- admin auth calls require SECRET_HASH and will fail.")
    print()
    print("=" * 60)
    print(" CONNECTED TO COGNITO SUCCESSFULLY")
    print(" User Pool and App Client are reachable and configured.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 -- final safety net, see module docstring
        print(f"FAILED: unexpected error ({type(exc).__name__}): {exc}")
        sys.exit(1)
