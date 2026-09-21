# Implementation Record — Branch Data Pipeline

Status: Phases 2–6, 8–10 of the approved plan are built, tested, and
verified running end-to-end locally. Phases 0, 1, 11 remain blocked on
client-provided AWS access (see "What's still blocked" below).

## What was built

A Python backend that serves branch-security records over HTTP, and a
frontend wiring change that makes the existing dashboard fetch from it
instead of generating sample data in the browser. The backend currently
serves deterministic mock data; switching it to the real DynamoDB table
is a one-file change (see `backend/README.md`).

```
DynamoDB (real, not yet connected)
   |  IAM role, read-only
   v
backend/app/data/dynamodb_source.py   <-- implemented, wired, disabled by default
   |
   |  (today: backend/app/data/mock_source.py is used instead)
   v
FastAPI app (backend/app/main.py)
   |  GET /api/branches   (X-API-Key required, rate-limited, CORS-locked)
   |  GET /api/branches/{id}
   |  GET /health          (unauthenticated)
   v
tngb-dashboard/src/data/liveSource.js
   |  fetch() on page load, before first render
   v
tngb-dashboard/src/data/master.js  ->  App.data.setBranches(list)
   |
   v
Every existing view (overview, reports, maps, drill-downs...) — unchanged
```

## Backend — `backend/`

```
app/
  main.py              FastAPI app: CORS, rate-limit handler, request logging
  config.py            Settings from environment (.env) -- no secrets hard-coded
  security.py          API-key auth dependency + rate limiter (slowapi)
  logging_config.py    Structured stdout logging, CloudWatch-friendly
  models.py            Pydantic response shapes -- the dashboard's data contract
  data/
    base.py            DataSource abstract interface
    mock_source.py      Deterministic sample data (default, no AWS dependency)
    dynamodb_source.py  Real data source via boto3 + the granted IAM role
    __init__.py         Picks mock vs dynamodb from DATA_SOURCE setting
  routers/
    branches.py         GET /api/branches, GET /api/branches/{id}
    health.py            GET /health
tests/                  13 tests: data shape, auth, CORS, 404 handling
requirements.txt / requirements-dev.txt
.env.example
README.md               Run/test/switch-to-DynamoDB instructions
```

### Security controls implemented

- **Auth**: every `/api/*` route requires a valid `X-API-Key` header
  (`app/security.py`). Missing or wrong keys return 401 and are logged
  (`auth_failed client_ip=... path=...`) so repeated probing is visible in
  logs. `/health` is intentionally open — it reveals nothing sensitive and
  is what an uptime check hits.
- **Rate limiting**: 60 requests/minute per client IP (`slowapi`), returns
  429 once exceeded. Configurable via `RATE_LIMIT`.
- **CORS**: locked to exactly one configured origin (`CORS_ALLOW_ORIGIN`),
  never a wildcard. Verified by test (`test_cors_blocks_other_origins`).
- **No secrets in code**: the DynamoDB path authenticates purely through
  the IAM role attached to wherever this runs — no access key is stored,
  read, or logged anywhere in this codebase. The API key is read from the
  environment, never hard-coded, and `.env` is gitignored.
- **Least-privilege data access**: `DynamoDBDataSource` only ever calls
  `scan()` (read) — no write, update, or delete path exists in this
  codebase, so even a misconfigured IAM role can't be used destructively
  through this backend.
- **Error handling**: internal errors return generic messages to the
  client; details go to server-side logs only (`app/main.py`'s request
  logging middleware, `app/data/dynamodb_source.py`'s `logger.exception`).
- **Dependency scanning**: `pip-audit` run against `requirements.txt` as
  part of this build (see "Verification performed" below) and wired into
  CI (`.github/workflows/backend-ci.yml`) so it runs on every push.

### Known, deliberate limitation

The API key travels to a browser-based frontend, which means it's visible
to anyone who opens dev tools on the dashboard. This is the interim
control described in the approved plan (Phase 5) — acceptable for a
staging/demo credential, not sufficient on its own once this is
internet-reachable. The unresolved decision (tracked from the original
plan) is whether to add a real identity provider (e.g. Cognito) in front
of the dashboard itself; that's a Phase 0/7 decision, not something this
build could resolve on its own.

## Frontend — `tngb-dashboard/`

Three files changed, one file added; no existing view file was touched.

- **`src/data/master.js`** — added `setBranches(list)`, an injection point
  that overrides the internal cache every other function
  (`networkStats`, `districtStats`, `branchById`, etc.) already reads
  through. This is the only change needed for live data to flow through
  the entire app unmodified.
- **`src/data/liveSource.js`** (new) — fetches `/api/branches` from the
  backend, calls `setBranches`, and recomputes each district's branch
  count from the real data. Not loaded by `tests/selftest.html`, so the
  original offline self-test suite is completely unaffected.
- **`src/app.js`** — `start()` now checks for `App.data.load`. If present
  (live mode), it shows a loading screen, awaits the fetch, then boots
  normally; on failure it shows a retry screen naming the problem instead
  of a blank page. If absent (self-test, or `liveSource.js` not included),
  behavior is byte-for-byte what it was before this change.
- **`assets/styles.css`** — added `.boot-state` / `.boot-card` /
  `.boot-spinner` / `.boot-retry` rules for the two new screens, using the
  project's existing design tokens (`--navy`, `--red`, etc.) rather than
  introducing new colors.
- **`index.html`** — added one `<script>` tag loading `liveSource.js`.

### Local-dev-only configuration note

`src/data/liveSource.js` currently hard-codes `apiBaseUrl` and `apiKey` for
local testing (`http://127.0.0.1:8787` / `dev-local-key-change-me`). In a
real deployment these must be injected per-environment at build/deploy
time (e.g. a generated config file, or values substituted by the CI
pipeline) — never committed as real values. This is flagged in a comment
at the top of that file.

## Verification performed

- `cd backend && pytest -q` → **13 passed**. Covers: mock data shape and
  determinism, every district represented, `/health` unauthenticated,
  `/api/branches` and `/api/branches/{id}` with a valid key, 404 on an
  unknown id, 401 on missing/wrong key, CORS allow/deny behavior.
- `pip-audit -r requirements.txt` → **0 known vulnerabilities** (found and
  fixed 8 during this build: an outdated `python-dotenv` and an outdated
  transitive `starlette`, both bumped to patched versions).
- Backend started locally (`uvicorn`, port 8787) and hit directly with
  `curl`: confirmed `/health`, 401 without a key, 200 with real branch
  JSON with a key, and the CORS header matching the configured origin.
- Dashboard rendered headlessly (Edge `--headless=new --dump-dom`) against
  the running backend: confirmed real fetched data on screen (branch
  counts, a named manager, a real email address, the correct network-wide
  alarm pill) — not the generated sample set.
- `tests/selftest.html` (the project's own existing regression suite) run
  the same way: **`RESULT: ALL PASS`**, unchanged from before this work,
  confirming the offline/self-test path was not broken.
- CI workflow added (`.github/workflows/backend-ci.yml`): runs `pytest`
  and `pip-audit` on every push touching `backend/`.

## Update (2026-09-21) — AWS credentials received and verified

A read-only IAM user (`tngrama_dashboard_reader`, not a role as originally
anticipated) was issued: `dynamodb:GetItem`/`Query`/`Scan`/`BatchGetItem`/
`DescribeTable` on `dtx_tngrama_telemetry` (region `ap-south-1`, account
`927656030687`), no write/delete access anywhere. Credentials are stored in
`backend/.env` (gitignored, never committed) and connectivity/authorization is
verified end-to-end via `backend/scripts/check_aws_connection.py` (see
`backend/README.md`, "Verify real AWS credentials"). `DATA_SOURCE` stays
`mock` — this only proves the backend *can* reach the real table, not that it
serves from it yet.

Also learned in this pass: `dtx_tngrama_telemetry` stores one row per *event*,
not one row per branch, and a `DeviceStatus` table (one row per panel's
current state) doesn't exist yet. This means the deferred schema-mapping work
below isn't just a field-rename in `_map_item` — it needs to decide how to
derive "current status per branch" from an event log (aggregate the latest
event per branch, or wait for `DeviceStatus`).

## What's still blocked

- **Schema mapping** — a real sample item (or `dashboard_data_access_guide.md`,
  referenced in the handoff but not yet shared) is still needed before
  `dynamodb_source.py`'s `_map_item()`/`list_branches()` can be rewritten
  against the real event shape, and before `DATA_SOURCE=dynamodb` can be
  safely turned on.
- **Phase 7 decision** — which AWS account this deploys into, and the
  dashboard's own login/identity mechanism, both still open questions.
- **Phase 11** — go-live checklist, which depends on all of the above.

Everything else in the original 12-phase plan that didn't depend on those
items is built and verified as described above.
