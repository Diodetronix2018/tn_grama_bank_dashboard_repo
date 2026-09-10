"""Real data source -- reads the branch table via the granted IAM role.

No access key or secret is configured here on purpose: boto3 picks up
credentials automatically from the execution environment (an attached IAM
role on Lambda/EC2/ECS, or a locally assumed role), which is the whole
point of being handed a role instead of a key pair.

`_map_item` is the one function that has to change once the client
provides the real table's attribute names (implementation-plan Phase 0).
Until then this assumes the table already stores items shaped like the
dashboard's contract in `app/models.py` -- adjust the field lookups below
to match the real schema when it arrives.
"""

import logging

import boto3
from botocore.exceptions import ClientError

from app.data.base import DataSource
from app.models import Branch, BranchEvent, Manager

logger = logging.getLogger("app.data.dynamodb")


class DynamoDBDataSource(DataSource):
    def __init__(self, table_name: str, region: str) -> None:
        if not table_name or not region:
            raise ValueError(
                "DYNAMODB_TABLE_NAME and AWS_REGION must be set to use the dynamodb data source"
            )
        self._table_name = table_name
        self._resource = boto3.resource("dynamodb", region_name=region)
        self._table = self._resource.Table(table_name)

    def list_branches(self) -> list[Branch]:
        items: list[dict] = []
        scan_kwargs: dict = {}
        try:
            while True:
                response = self._table.scan(**scan_kwargs)
                items.extend(response.get("Items", []))
                last_key = response.get("LastEvaluatedKey")
                if not last_key:
                    break
                scan_kwargs["ExclusiveStartKey"] = last_key
        except ClientError:
            logger.exception("dynamodb_scan_failed table=%s", self._table_name)
            raise

        return [_map_item(item) for item in items]


def _map_item(item: dict) -> Branch:
    """Translate one raw DynamoDB item into the dashboard's Branch shape.

    Placeholder mapping -- assumes the item's attribute names already match
    the contract. Replace the right-hand side of each lookup once the real
    table schema is known.
    """
    manager = item.get("manager", {})
    events = item.get("events", [])
    return Branch(
        id=item["id"],
        name=item["name"],
        branchIdCode=item["branchIdCode"],
        district=item["district"],
        panelStatus=item["panelStatus"],
        connectivity=item["connectivity"],
        status=item["status"],
        manager=Manager(
            name=manager.get("name", ""),
            id=manager.get("id", ""),
            contact=manager.get("contact", ""),
            email=manager.get("email", ""),
        ),
        events=[
            BranchEvent(type=e.get("type", ""), time=e.get("time", ""), zone=e.get("zone"))
            for e in events
        ],
    )
