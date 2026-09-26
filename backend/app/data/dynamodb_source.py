"""Real data source -- reads the branch table via a static IAM-user key pair.

The real table (`dtx_tngrama_telemetry`) is NOT shaped like the dashboard's
`Branch` contract. It is a raw IoT device-telemetry log: one row per message
a physical alarm panel sends, keyed by `thingName` (the panel's serial
number), with no secondary index and no separate "current status" table.
Building a `Branch` means grouping a device's rows and folding them into a
current snapshot plus a short event history -- see `_build_branch` below.

Field/status/event derivation here is **best-effort, not vendor-confirmed**:
the raw `trigger`/`trigger_type` vocabulary (`initial`, `user control`,
`alarm`, `info`, `heartbeat`, `battery`, `signal`, `zone on off status`) is
inconsistent in practice, so this maps from the raw boolean flags
(`status`/`alarm`/`ac_fail`/`bat_fail`/`chg_fail`/`hooter_fail`) instead,
which are more reliable. Revisit once the device vendor confirms exact
semantics. Zone-level detail (`zon`/`zmd`/`zen`/`zloc`) and tamper events are
deliberately not derived yet -- branch-level only for this pass.
"""

import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from itertools import pairwise

import boto3
from botocore.exceptions import ClientError

from app.data.base import DataSource
from app.models import Branch, BranchEvent, Connectivity, Manager, PanelStatus, headline_status

logger = logging.getLogger("app.data.dynamodb")

# Tunable, not a vendor-confirmed value: real observed gaps between messages
# ranged from under a minute to over a day. A panel silent this long is
# reported Offline, and the same threshold buckets Communication Lost/
# Restored event pairs.
STALE_AFTER_MINUTES = 15

MAX_EVENTS_PER_BRANCH = 20

FAULT_FLAG_FIELDS = ("ac_fail", "bat_fail", "chg_fail", "hooter_fail")

# field -> (event emitted on 0->1 or first-seen "1", event emitted on 1->0).
# None means that edge isn't reported (the dashboard's event vocabulary --
# tngb-dashboard/src/data/derived.js's EVENT_TYPES -- has no "Alarm Restore"
# or "Fault Restore").
TRANSITIONS: dict[str, tuple[str, str | None]] = {
    "status": ("Arm", "Disarm"),
    "alarm": ("Alarm", None),
    "ac_fail": ("AC Fail", "AC Restore"),
    "bat_fail": ("Battery Fail", "Battery Restore"),
    "chg_fail": ("Fault", None),
    "hooter_fail": ("Fault", None),
}


class DynamoDBDataSource(DataSource):
    def __init__(
        self,
        table_name: str,
        region: str,
        access_key_id: str = "",
        secret_access_key: str = "",
    ) -> None:
        if not table_name or not region:
            raise ValueError(
                "DYNAMODB_TABLE_NAME and AWS_REGION must be set to use the dynamodb data source"
            )
        self._table_name = table_name
        session_kwargs: dict = {"region_name": region}
        if access_key_id and secret_access_key:
            session_kwargs["aws_access_key_id"] = access_key_id
            session_kwargs["aws_secret_access_key"] = secret_access_key
        self._resource = boto3.resource("dynamodb", **session_kwargs)
        self._table = self._resource.Table(table_name)

    def _scan_all(self) -> list[dict]:
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
        return items

    def list_branches(self) -> list[Branch]:
        items = self._scan_all()
        groups: dict[str, list[dict]] = defaultdict(list)
        for item in items:
            thing_name = item.get("thingName")
            if not thing_name:
                logger.warning("dynamodb_item_missing_thing_name item=%r", item)
                continue
            groups[thing_name].append(item)

        now = datetime.now(UTC)
        branches: list[Branch] = []
        for thing_name, rows in groups.items():
            try:
                branches.append(_build_branch(thing_name, rows, now))
            except Exception:
                logger.exception("dynamodb_map_failed thing_name=%s", thing_name)
                continue
        branches.sort(key=lambda b: b.id)
        return branches


def _flag(state: dict, key: str) -> str:
    """Normalize a raw flag value (str, or Decimal from boto3) to "0"/"1"."""
    return str(state.get(key, "0"))


def _event_time(row: dict) -> str:
    time_str = (row.get("datetime") or "")[:16]
    if time_str:
        return time_str
    ts = datetime.fromtimestamp(int(row["timestamp"]) / 1000, tz=UTC)
    return ts.strftime("%Y-%m-%d %H:%M")


def _fold_state_and_events(rows_sorted: list[dict]) -> tuple[dict, list[BranchEvent]]:
    """Fold a device's rows (oldest first) into its latest known state, plus
    the transition events observed along the way.

    Some rows are thin "fields changed" notifications carrying no actual
    values (only a CSV of field *names* in `trigger`) -- `state.update(row)`
    per row means such a row can never blank out the last real values, since
    it simply doesn't carry those keys.
    """
    state: dict = {}
    prev: dict = {}
    events: list[BranchEvent] = []
    for row in rows_sorted:
        state.update(row)
        for field, (rise, fall) in TRANSITIONS.items():
            if field not in row:
                continue
            new_val = str(row[field])
            old_val = prev.get(field)
            if new_val == old_val:
                continue
            if new_val == "1" and rise:
                events.append(BranchEvent(type=rise, time=_event_time(row)))
            elif new_val == "0" and fall and old_val is not None:
                events.append(BranchEvent(type=fall, time=_event_time(row)))
            prev[field] = new_val
    return state, events


def _comm_events_from_gaps(rows_sorted: list[dict], threshold_minutes: int) -> list[BranchEvent]:
    events: list[BranchEvent] = []
    for prev_row, row in pairwise(rows_sorted):
        gap_minutes = (int(row["timestamp"]) - int(prev_row["timestamp"])) / 60000
        if gap_minutes > threshold_minutes:
            events.append(BranchEvent(type="Communication Lost", time=_event_time(prev_row)))
            events.append(BranchEvent(type="Communication Restored", time=_event_time(row)))
    return events


def _derive_connectivity(latest_ts_ms: int, now: datetime) -> Connectivity:
    last_seen = datetime.fromtimestamp(latest_ts_ms / 1000, tz=UTC)
    if (now - last_seen) <= timedelta(minutes=STALE_AFTER_MINUTES):
        return "Online"
    return "Offline"


def _derive_panel_status(state: dict, connectivity: Connectivity) -> PanelStatus:
    if connectivity == "Offline":
        return "Offline"
    if _flag(state, "alarm") == "1":
        return "Alarm Active"
    if any(_flag(state, f) == "1" for f in FAULT_FLAG_FIELDS):
        return "Fault"
    if _flag(state, "status") == "1":
        return "Armed"
    return "Disarmed"


def _build_branch(thing_name: str, rows: list[dict], now: datetime) -> Branch:
    rows_sorted = sorted(rows, key=lambda r: int(r["timestamp"]))
    state, transition_events = _fold_state_and_events(rows_sorted)
    comm_events = _comm_events_from_gaps(rows_sorted, STALE_AFTER_MINUTES)
    events = sorted(
        transition_events + comm_events, key=lambda e: e.time, reverse=True
    )[:MAX_EVENTS_PER_BRANCH]

    latest_ts_ms = int(rows_sorted[-1]["timestamp"])
    connectivity = _derive_connectivity(latest_ts_ms, now)
    panel_status = _derive_panel_status(state, connectivity)

    branch = state.get("branch")
    district = state.get("district")
    manager_name = state.get("manager")
    brcode = state.get("brcode")

    # NOTE: manager/mobile/mail in the raw data look like the installer's own
    # contact info ("DIODETRONIX"), not a real branch manager's -- mapped
    # through as-is per the best-effort mandate, but worth escalating before
    # this is relied on for real incident contact/escalation.
    return Branch(
        id=thing_name,
        name=branch or f"Unassigned Panel ({thing_name})",
        branchIdCode=brcode or thing_name,
        district=district or "Unassigned",
        panelStatus=panel_status,
        connectivity=connectivity,
        status=headline_status(panel_status, connectivity),
        manager=Manager(
            name=manager_name or "Unassigned",
            id=brcode or "UNASSIGNED",
            contact=state.get("mobile") or "Not available",
            email=state.get("mail") or "Not available",
        ),
        events=events,
    )
