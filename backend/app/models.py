"""Response shapes.

This is the contract the dashboard's frontend already speaks -- see
tngb-dashboard/README.md, "Connecting real data". Every data source
(mock or DynamoDB) has to produce exactly this shape; the frontend never
needs to know which one is behind the API.
"""

from typing import Literal

from pydantic import BaseModel, Field

PanelStatus = Literal["Armed", "Disarmed", "Alarm Active", "Fault", "Offline"]
Connectivity = Literal["Online", "Offline"]
HeadlineStatus = Literal["Normal", "Alarm", "Fault", "Offline"]


def headline_status(panel_status: str, connectivity: str) -> HeadlineStatus:
    """A branch's one-word status: the most serious of alarm, fault and
    offline, else Normal. Mirrors branchHeadline in the dashboard's
    src/data/master.js."""
    if panel_status == "Alarm Active":
        return "Alarm"
    if panel_status == "Fault":
        return "Fault"
    if connectivity == "Offline":
        return "Offline"
    return "Normal"


class Manager(BaseModel):
    name: str
    id: str
    contact: str
    email: str


class BranchEvent(BaseModel):
    type: str
    time: str
    zone: str | None = None


class Branch(BaseModel):
    id: str
    name: str
    branchIdCode: str = Field(alias="branchIdCode")
    district: str
    panelStatus: PanelStatus
    connectivity: Connectivity
    status: HeadlineStatus
    manager: Manager
    events: list[BranchEvent] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class BranchListResponse(BaseModel):
    branches: list[Branch]
    count: int
    source: Literal["mock", "dynamodb"]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    source: Literal["mock", "dynamodb"]
