"""Deterministic sample data -- stands in for the real DynamoDB table.

Same shape as the frontend's own generated sample data (see
tngb-dashboard/src/data/master.js), so swapping this dashboard between
"local demo" and "backend-fed demo" is invisible to a viewer. The seed is
fixed, so every run produces the same branches, same as the frontend's
own generator.
"""

import random

from app.data.base import DataSource
from app.models import Branch, BranchEvent, Manager, headline_status

DISTRICTS = [
    "Ariyalur", "Chengalpattu", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul",
    "Erode", "Kallakurichi", "Kancheepuram", "Kanyakumari", "Karur", "Krishnagiri",
    "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur",
    "Pudukottai", "Ramanathapuram", "Ranipettai", "Salem", "Sivagangai", "Tenkasi",
    "Thanjavur", "Theni", "Thiruvallur", "Thiruvarur", "Thoothukudi", "Tiruchirappalli",
    "Tirunelveli", "Tirupathur", "Tirupattur", "Tiruppur", "Tiruvannamalai", "Vellore",
    "Villupuram", "Virudhunagar",
]

BRANCH_SUFFIXES = [
    "Main Branch", "Town Branch", "Bazaar Branch", "RS Puram", "Extension Counter",
    "New Bus Stand", "Market Branch", "College Road",
]
FIRST_NAMES = ["K.", "S.", "R.", "M.", "P.", "V.", "N.", "A.", "T.", "G."]
LAST_NAMES = [
    "Bhuvaneswari", "Elango", "Saravanan", "Meenakshi", "Gopinath",
    "Kumar", "Devi", "Rajan", "Priya", "Suresh",
]
SAMPLE_ZONES = ["Main Entrance", "Strong Room", "Cash Counter", "Back Door", "ATM Room"]

# [count, panelStatus, connectivity] -- mirrors the frontend's status mix so
# a branch-security screenshot looks the same regardless of which source fed it.
CATEGORY_MIX = [
    (5, "Armed", "Online"),
    (2, "Disarmed", "Online"),
    (1, "Alarm Active", "Offline"),
    (1, "Fault", "Offline"),
    (1, "Offline", "Offline"),
]

SEED = 20260907


def _build_events(rng: random.Random, panel_status: str, connectivity: str) -> list[BranchEvent]:
    events: list[BranchEvent] = []
    needs_attention = panel_status in ("Alarm Active", "Fault")
    if connectivity == "Offline":
        events.append(BranchEvent(type="Communication Lost", time="2026-09-05 10:12"))
        if needs_attention:
            events.append(
                BranchEvent(
                    type="Alarm" if panel_status == "Alarm Active" else "Fault",
                    zone=f"Zone {rng.randint(1, 8)} - {rng.choice(SAMPLE_ZONES)}",
                    time="2026-09-07 21:40",
                )
            )
    else:
        events.append(
            BranchEvent(type="Disarm" if panel_status == "Disarmed" else "Arm", time="2026-09-08 06:15")
        )
    return events


class MockDataSource(DataSource):
    def __init__(self, seed: int = SEED) -> None:
        self._seed = seed
        self._cache: list[Branch] | None = None

    def list_branches(self) -> list[Branch]:
        if self._cache is not None:
            return self._cache

        rng = random.Random(self._seed)
        pool: list[tuple[str, str]] = []
        for count, panel_status, connectivity in CATEGORY_MIX:
            pool.extend([(panel_status, connectivity)] * count)
        rng.shuffle(pool)

        branches: list[Branch] = []
        for district in DISTRICTS:
            branch_count = 5 + (hash((district, self._seed)) % 6)  # 5-10, deterministic
            for i in range(branch_count):
                panel_status, connectivity = pool[(len(branches) + i) % len(pool)]
                branch_rng = random.Random(f"{district}#{i}#{self._seed}")
                manager_name = f"{branch_rng.choice(FIRST_NAMES)} {branch_rng.choice(LAST_NAMES)}"
                email_user = "".join(c for c in manager_name if c.isalpha()).lower() or "manager"

                branches.append(
                    Branch(
                        id=f"{district}-{i}",
                        name=f"{district} {BRANCH_SUFFIXES[i % len(BRANCH_SUFFIXES)]}",
                        branchIdCode=f"TNGB-{2000 + branch_rng.randint(0, 7999)}",
                        district=district,
                        panelStatus=panel_status,
                        connectivity=connectivity,
                        status=headline_status(panel_status, connectivity),
                        manager=Manager(
                            name=manager_name,
                            id=f"BM-{1000 + branch_rng.randint(0, 8999)}",
                            contact=f"+91 9{branch_rng.randint(400000000, 499999999)}",
                            email=f"{email_user}.{district.lower().replace(' ', '')}@tngb.co.in",
                        ),
                        events=_build_events(branch_rng, panel_status, connectivity),
                    )
                )

        self._cache = branches
        return self._cache
