from app.data.mock_source import MockDataSource


def test_returns_branches():
    branches = MockDataSource().list_branches()
    assert len(branches) > 0


def test_shape_matches_dashboard_contract():
    branch = MockDataSource().list_branches()[0]
    assert branch.id
    assert branch.district
    assert branch.panelStatus in ("Armed", "Disarmed", "Alarm Active", "Fault", "Offline")
    assert branch.connectivity in ("Online", "Offline")
    assert branch.status in ("Normal", "Alarm", "Fault", "Offline")
    assert branch.manager.name
    assert branch.manager.email
    assert isinstance(branch.events, list)


def test_deterministic_across_calls():
    a = MockDataSource().list_branches()
    b = MockDataSource().list_branches()
    assert [x.id for x in a] == [x.id for x in b]


def test_status_reflects_panel_and_connectivity():
    for branch in MockDataSource().list_branches():
        if branch.panelStatus == "Alarm Active":
            expected = "Alarm"
        elif branch.panelStatus == "Fault":
            expected = "Fault"
        elif branch.connectivity == "Offline":
            expected = "Offline"
        else:
            expected = "Normal"
        assert branch.status == expected


def test_covers_every_district():
    from app.data.mock_source import DISTRICTS

    seen = {b.district for b in MockDataSource().list_branches()}
    assert seen == set(DISTRICTS)
