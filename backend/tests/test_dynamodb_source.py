from datetime import UTC, datetime

from app.data.dynamodb_source import (
    STALE_AFTER_MINUTES,
    _build_branch,
    _comm_events_from_gaps,
    _derive_connectivity,
    _derive_panel_status,
    _fold_state_and_events,
)

BASE_TS = 1_789_799_000_000  # arbitrary epoch-ms anchor for fixture rows


def row(ts_offset_ms=0, **fields):
    ts = BASE_TS + ts_offset_ms
    dt = datetime.fromtimestamp(ts / 1000, tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
    base = {"timestamp": str(ts), "datetime": dt, "thingName": "DTX1"}
    base.update(fields)
    return base


def now_at(ts_offset_ms=0):
    return datetime.fromtimestamp((BASE_TS + ts_offset_ms) / 1000, tz=UTC)


def test_full_snapshot_maps_assigned_branch():
    rows = [
        row(
            branch="CHENNAI BRANCH",
            district="CHENNAI",
            brcode="000001",
            manager="DIODETRONIX",
            mobile="1234567890",
            mail="diodetronix@gmail.com",
            status="1",
            alarm="0",
            ac_fail="0",
            bat_fail="0",
            chg_fail="0",
            hooter_fail="0",
        )
    ]
    branch = _build_branch("DTX1", rows, now_at())
    assert branch.name == "CHENNAI BRANCH"
    assert branch.district == "CHENNAI"
    assert branch.branchIdCode == "000001"
    assert branch.manager.name == "DIODETRONIX"
    assert branch.manager.contact == "1234567890"
    assert branch.manager.email == "diodetronix@gmail.com"


def test_unassigned_device_falls_back():
    rows = [row(branch=None, district=None, brcode=None, manager=None, mobile=None, mail=None, status="0")]
    branch = _build_branch("DTX1", rows, now_at())
    assert branch.name == "Unassigned Panel (DTX1)"
    assert branch.district == "Unassigned"
    assert branch.branchIdCode == "DTX1"
    assert branch.manager.name == "Unassigned"
    assert branch.manager.id == "UNASSIGNED"
    assert branch.manager.contact == "Not available"
    assert branch.manager.email == "Not available"


def test_thin_notification_row_does_not_override_latest_snapshot():
    full = row(ts_offset_ms=0, branch="CHENNAI BRANCH", district="CHENNAI", status="1", alarm="0")
    thin = row(ts_offset_ms=1000, trigger="ac_fail,alarm,status", trigger_type="alarm")
    branch = _build_branch("DTX1", [full, thin], now_at(ts_offset_ms=1000))
    assert branch.name == "CHENNAI BRANCH"
    assert branch.district == "CHENNAI"
    assert branch.panelStatus == "Armed"


def test_panel_status_armed():
    state = {"status": "1", "alarm": "0", "ac_fail": "0", "bat_fail": "0", "chg_fail": "0", "hooter_fail": "0"}
    assert _derive_panel_status(state, "Online") == "Armed"


def test_panel_status_disarmed():
    state = {"status": "0", "alarm": "0", "ac_fail": "0", "bat_fail": "0", "chg_fail": "0", "hooter_fail": "0"}
    assert _derive_panel_status(state, "Online") == "Disarmed"


def test_panel_status_alarm_active():
    state = {"status": "1", "alarm": "1", "ac_fail": "0", "bat_fail": "0", "chg_fail": "0", "hooter_fail": "0"}
    assert _derive_panel_status(state, "Online") == "Alarm Active"


def test_panel_status_fault():
    state = {"status": "1", "alarm": "0", "ac_fail": "1", "bat_fail": "0", "chg_fail": "0", "hooter_fail": "0"}
    assert _derive_panel_status(state, "Online") == "Fault"


def test_panel_status_offline_overrides_everything():
    state = {"status": "1", "alarm": "1", "ac_fail": "1", "bat_fail": "0", "chg_fail": "0", "hooter_fail": "0"}
    assert _derive_panel_status(state, "Offline") == "Offline"


def test_connectivity_online_within_threshold():
    connectivity = _derive_connectivity(BASE_TS, now_at(ts_offset_ms=5 * 60 * 1000))
    assert connectivity == "Online"


def test_connectivity_offline_when_stale():
    past_threshold_ms = (STALE_AFTER_MINUTES + 1) * 60 * 1000
    connectivity = _derive_connectivity(BASE_TS, now_at(ts_offset_ms=past_threshold_ms))
    assert connectivity == "Offline"


def test_grouping_picks_latest_per_thing_name():
    from app.data.dynamodb_source import DynamoDBDataSource

    # list_branches() derives connectivity against the real wall clock, so
    # these rows must be "recent" regardless of when the test actually runs.
    real_now_ms = int(datetime.now(UTC).timestamp() * 1000)

    def recent_row(offset_ms, **fields):
        ts = real_now_ms - 2000 + offset_ms
        dt = datetime.fromtimestamp(ts / 1000, tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
        base = {"timestamp": str(ts), "datetime": dt}
        base.update(fields)
        return base

    rows = [
        recent_row(0, thingName="DTX1", branch="A BRANCH", status="0"),
        recent_row(1000, thingName="DTX1", branch="A BRANCH", status="1"),
        recent_row(0, thingName="DTX2", branch="B BRANCH", status="1"),
    ]

    class _FakeSource(DynamoDBDataSource):
        def __init__(self, items):
            self._items = items
            self._table_name = "fake"

        def _scan_all(self):
            return self._items

    branches = {b.id: b for b in _FakeSource(rows).list_branches()}
    assert set(branches) == {"DTX1", "DTX2"}
    assert branches["DTX1"].panelStatus == "Armed"  # latest row has status=1
    assert branches["DTX2"].name == "B BRANCH"


def test_arm_disarm_events_from_status_transitions():
    rows = [
        row(ts_offset_ms=0, status="0"),
        row(ts_offset_ms=1000, status="1"),
        row(ts_offset_ms=2000, status="0"),
    ]
    _, events = _fold_state_and_events(rows)
    assert [e.type for e in events] == ["Arm", "Disarm"]


def test_ac_fail_restore_events():
    rows = [
        row(ts_offset_ms=0, ac_fail="0"),
        row(ts_offset_ms=1000, ac_fail="1"),
        row(ts_offset_ms=2000, ac_fail="0"),
    ]
    _, events = _fold_state_and_events(rows)
    assert [e.type for e in events] == ["AC Fail", "AC Restore"]


def test_field_name_only_row_produces_no_event():
    rows = [row(trigger="ac_fail,alarm,status", trigger_type="alarm")]
    _, events = _fold_state_and_events(rows)
    assert events == []


def test_communication_lost_and_restored_from_gap():
    gap_ms = (STALE_AFTER_MINUTES + 5) * 60 * 1000
    rows = [row(ts_offset_ms=0), row(ts_offset_ms=gap_ms)]
    events = _comm_events_from_gaps(rows, STALE_AFTER_MINUTES)
    assert [e.type for e in events] == ["Communication Lost", "Communication Restored"]


def test_no_communication_event_within_threshold():
    gap_ms = 5 * 60 * 1000
    rows = [row(ts_offset_ms=0), row(ts_offset_ms=gap_ms)]
    events = _comm_events_from_gaps(rows, STALE_AFTER_MINUTES)
    assert events == []


def test_events_capped_at_twenty_and_sorted_newest_first():
    rows = []
    for i in range(30):
        rows.append(row(ts_offset_ms=i * 1000, status=str(i % 2)))
    branch = _build_branch("DTX1", rows, now_at(ts_offset_ms=30 * 1000))
    assert len(branch.events) <= 20
    times = [e.time for e in branch.events]
    assert times == sorted(times, reverse=True)
