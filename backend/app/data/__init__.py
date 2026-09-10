from functools import lru_cache

from app.config import get_settings
from app.data.base import DataSource
from app.data.mock_source import MockDataSource


@lru_cache
def get_data_source() -> DataSource:
    settings = get_settings()
    if settings.data_source == "dynamodb":
        # Imported lazily so `boto3` is only required when actually used --
        # the mock path (used in tests and local dev) has no AWS dependency.
        from app.data.dynamodb_source import DynamoDBDataSource

        return DynamoDBDataSource(
            table_name=settings.dynamodb_table_name,
            region=settings.aws_region,
        )
    return MockDataSource()
