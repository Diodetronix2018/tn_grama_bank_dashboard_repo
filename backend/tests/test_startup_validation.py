import pytest
from pydantic import SecretStr

from app.config import Settings
from app.main import _validate_dynamodb_settings


def _settings(**overrides) -> Settings:
    base = {
        "data_source": "dynamodb",
        "aws_region": "",
        "dynamodb_table_name": "",
        "aws_access_key_id": "",
        "aws_secret_access_key": SecretStr(""),
    }
    base.update(overrides)
    return Settings(**base)


def test_mock_needs_no_aws_settings():
    settings = Settings(data_source="mock")
    _validate_dynamodb_settings(settings)  # must not raise


def test_dynamodb_missing_all_fields_raises():
    with pytest.raises(RuntimeError) as exc_info:
        _validate_dynamodb_settings(_settings())
    message = str(exc_info.value)
    assert "AWS_REGION" in message
    assert "DYNAMODB_TABLE_NAME" in message
    assert "AWS_ACCESS_KEY_ID" in message
    assert "AWS_SECRET_ACCESS_KEY" in message


def test_dynamodb_missing_one_field_lists_only_that_field():
    settings = _settings(
        aws_region="ap-south-1",
        dynamodb_table_name="dtx_tngrama_telemetry",
        aws_access_key_id="AKIAEXAMPLE",
        aws_secret_access_key=SecretStr(""),
    )
    with pytest.raises(RuntimeError) as exc_info:
        _validate_dynamodb_settings(settings)
    message = str(exc_info.value)
    assert "AWS_SECRET_ACCESS_KEY" in message
    assert "AWS_REGION" not in message
    assert "DYNAMODB_TABLE_NAME" not in message
    assert "AWS_ACCESS_KEY_ID" not in message


def test_dynamodb_with_all_fields_passes():
    settings = _settings(
        aws_region="ap-south-1",
        dynamodb_table_name="dtx_tngrama_telemetry",
        aws_access_key_id="AKIAEXAMPLE",
        aws_secret_access_key=SecretStr("dummy-secret"),
    )
    _validate_dynamodb_settings(settings)  # must not raise
