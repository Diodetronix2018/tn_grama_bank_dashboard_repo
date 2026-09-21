"""One-off connectivity check for the AWS credentials issued to the
dashboard backend (IAM user tngrama_dashboard_reader).

Deliberately standalone: does not import the FastAPI app or app.data, does
not touch DATA_SOURCE, and has no effect on the running backend either way.
Its only job is to answer "do these credentials work," nothing else --
mapping the real table's schema is a separate, later phase.

Run from backend/ with the venv active:

    python -m scripts.check_aws_connection
    python -m scripts.check_aws_connection --sample-item   # optional, see below
"""

import argparse
import json
import sys

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings


def _mask(access_key_id: str) -> str:
    if len(access_key_id) <= 4:
        return "*" * len(access_key_id)
    return "*" * (len(access_key_id) - 4) + access_key_id[-4:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sample-item",
        action="store_true",
        help=(
            "After a successful connectivity check, also fetch and print one "
            "real item (Scan, Limit=1) to seed the deferred schema-mapping "
            "phase. Off by default; has no effect on the running app."
        ),
    )
    args = parser.parse_args()

    settings = get_settings()

    missing = []
    if not settings.aws_access_key_id:
        missing.append("AWS_ACCESS_KEY_ID")
    if not settings.aws_secret_access_key.get_secret_value():
        missing.append("AWS_SECRET_ACCESS_KEY")
    if not settings.aws_region:
        missing.append("AWS_REGION")
    if not settings.dynamodb_table_name:
        missing.append("DYNAMODB_TABLE_NAME")
    if missing:
        print("FAILED: missing required settings in backend/.env: " + ", ".join(missing))
        print("Fill these in from the credentials issued for tngrama_dashboard_reader, then rerun.")
        return 1

    print("Checking AWS connectivity...")
    print(f"  Region:        {settings.aws_region}")
    print(f"  Target table:  {settings.dynamodb_table_name}")
    print(f"  Access key ID: {_mask(settings.aws_access_key_id)}")
    print()

    session = boto3.Session(
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key.get_secret_value(),
        region_name=settings.aws_region,
    )

    try:
        identity = session.client("sts").get_caller_identity()
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        message = exc.response.get("Error", {}).get("Message", str(exc))
        if code in ("InvalidClientTokenId", "SignatureDoesNotMatch", "UnrecognizedClientException"):
            print(f"FAILED: AWS rejected these credentials ({code}: {message}).")
            print(
                "The Access Key ID or Secret Access Key in backend/.env is wrong, "
                "mistyped, or deactivated -- re-check both against what was issued "
                "for tngrama_dashboard_reader."
            )
        else:
            print(f"FAILED: AWS rejected the identity check ({code}: {message}).")
        return 1
    except BotoCoreError as exc:
        print(f"FAILED: could not reach AWS ({exc}).")
        print('Check your network/VPN/proxy, and that AWS_REGION ("' + settings.aws_region + '") is valid.')
        return 1

    print("Step 1/2 OK -- credentials are valid.")
    print(f"  Account: {identity.get('Account')}")
    print(f"  Arn:     {identity.get('Arn')}")
    if identity.get("Account") != "927656030687":
        print(f"  WARNING: expected account 927656030687, got {identity.get('Account')}.")
    if "tngrama_dashboard_reader" not in (identity.get("Arn") or ""):
        print("  WARNING: this identity doesn't look like tngrama_dashboard_reader -- double-check the key pair.")
    print()

    dynamodb = session.client("dynamodb")
    try:
        table = dynamodb.describe_table(TableName=settings.dynamodb_table_name)["Table"]
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        message = exc.response.get("Error", {}).get("Message", str(exc))
        if code == "ResourceNotFoundException":
            print(f"FAILED: table '{settings.dynamodb_table_name}' was not found in region '{settings.aws_region}' for this account.")
            print(
                "Check AWS_REGION and DYNAMODB_TABLE_NAME in backend/.env, and confirm "
                "the table has actually been created (per the handoff notes, it may not "
                "have existed yet when keys were issued)."
            )
        elif code == "AccessDeniedException":
            print(
                f"FAILED: credentials are valid (identity confirmed above) but this IAM "
                f"user cannot call DescribeTable on '{settings.dynamodb_table_name}'."
            )
            print(
                "Check that policy tngrama_dashboard_read is attached to "
                "tngrama_dashboard_reader and its resource ARN matches "
                f"arn:aws:dynamodb:{settings.aws_region}:927656030687:table/{settings.dynamodb_table_name} exactly."
            )
        else:
            print(f"FAILED: AWS rejected the table check ({code}: {message}).")
        return 1
    except BotoCoreError as exc:
        print(f"FAILED: could not reach AWS ({exc}).")
        return 1

    gsi_names = [g["IndexName"] for g in table.get("GlobalSecondaryIndexes", [])]
    print("Step 2/2 OK -- table access confirmed.")
    print(f"  Status:            {table.get('TableStatus')}")
    print(f"  Approx item count: {table.get('ItemCount')} (DynamoDB updates this periodically, not live)")
    print(f"  GSIs:              {', '.join(gsi_names) if gsi_names else '(none)'}")
    print()
    print("=" * 60)
    print(" CONNECTED TO AWS SUCCESSFULLY")
    print(f" Read-only access to {settings.dynamodb_table_name} is confirmed working.")
    print("=" * 60)

    if args.sample_item:
        print()
        print("--- Optional: one sample item (for the deferred schema-mapping phase only) ---")
        table_resource = session.resource("dynamodb").Table(settings.dynamodb_table_name)
        items = table_resource.scan(Limit=1).get("Items", [])
        if items:
            print(json.dumps(items[0], indent=2, default=str))
        else:
            print("(table scanned successfully but returned zero items)")
        print("--- end sample item -- NOT used by the running app; DATA_SOURCE is still mock ---")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 -- final safety net, see module docstring
        print(f"FAILED: unexpected error ({type(exc).__name__}): {exc}")
        sys.exit(1)
