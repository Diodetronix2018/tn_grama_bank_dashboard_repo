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
`backend/README.md`, "Verify real AWS credentials").

Also learned in this pass: `dtx_tngrama_telemetry` stores one row per *event*,
not one row per branch, and a `DeviceStatus` table (one row per panel's
current state) doesn't exist yet. This means the deferred schema-mapping work
below isn't just a field-rename in `_map_item` — it needs to decide how to
derive "current status per branch" from an event log (aggregate the latest
event per branch, or wait for `DeviceStatus`).

## Update (2026-09-21) — Real data connected, backend hardened

`dynamodb_source.py` was rewritten to map the real event log (`thingName` =
device serial, grouped and folded into a current snapshot + capped event
history; `panelStatus`/`connectivity` derived from raw flags; documented as
best-effort pending vendor confirmation of exact `trigger_type` semantics).
`DATA_SOURCE=dynamodb` is now live — the dashboard serves real data (today: 2
devices, one fully assigned to a branch, one not).

Backend then hardened for production traffic: `/docs`/`/redoc`/`/openapi.json`
gated behind `ENVIRONMENT` (default exposes them; `production` disables);
global exception handler (generic JSON 500, no leaked detail); fail-fast
startup validation for `DATA_SOURCE=dynamodb` (refuses to boot on missing
config instead of 500ing on first request); an in-process TTL cache in front
of `list_branches()` (default 60s, well under the dashboard's 5-minute poll);
request-ID correlation through all log lines; a proxy-trust-aware
`get_client_ip()` for rate limiting/auth logs (off by default, documented
single-hop assumption when enabled); four standard security response headers;
`ruff`+`bandit` added to CI. Test suite made hermetic (`tests/conftest.py`
forces `DATA_SOURCE=mock` before any import, so `pytest` never depends on or
touches a developer's local `.env`/real AWS). Full detail and rationale in
each touched file's docstring/comments, and `backend/README.md`'s
"Known limitations" and "Before any non-local deployment" sections.

## Update (2026-09-23) — Login/logout built (backend + dashboard), blocked on Cognito provisioning

The dashboard now requires signing in. `/api/branches` and every other route
needs a valid session, issued by a new `/api/auth/login` after checking
credentials against AWS Cognito (`AdminInitiateAuth`) — no self-registration,
accounts are admin-created (`POST /api/auth/users`). The earlier `X-API-Key`
model is fully removed, not kept alongside it.

Session is a short-lived (30 min), backend-signed, httpOnly/Secure/
SameSite=Strict cookie — Cognito's own tokens never reach the browser, and
there's no server-side session store (a deliberate choice: this app's
anticipated deployment target is Lambda, where in-memory/DynamoDB session
state adds real complexity for a benefit — instant revocation — this
internal tool doesn't need at a 30-minute TTL). Signing uses stdlib
`hmac`/`hashlib` only, no new dependency. Full rationale in
`backend/app/auth/session.py`'s module docstring.

**Nothing about Cognito exists in AWS yet** — same shape of blocker as the
original DynamoDB access. All the code (`backend/app/auth/`,
`backend/app/routers/auth.py`, the dashboard's login/new-password screens,
sign-out) is built, tested (30+ new backend tests against a fake Cognito
client, no real AWS needed), and verified end-to-end against the real
running backend/dashboard — confirmed live that `/api/auth/login` correctly
returns a safe, generic error today (Cognito not configured) rather than
crashing or leaking anything, and that a real session cookie correctly
grants dashboard access once minted. What's missing is real Cognito to mint
that cookie from an actual login.

**To unblock:** a Cognito User Pool + App Client need to be provisioned and
handed over (see `backend/README.md`, "Login (Cognito)"). Specifically:

- Sign-in by email, self-registration disabled (admin-create only),
  password policy 12+ chars with upper/lower/number/symbol, MFA provisioned
  as `OPTIONAL` (login flow already handles the `SMS_MFA`/`SOFTWARE_TOKEN_MFA`
  challenge — see the 2026-09-24 update below — so this activates automatically
  for any user who has MFA enrolled, no further code changes needed).
- App Client: confidential (has a secret — the browser never talks to
  Cognito directly), only `ALLOW_ADMIN_USER_PASSWORD_AUTH` enabled, no
  Hosted UI.
- IAM, scoped to that one User Pool's ARN: `AdminInitiateAuth`,
  `AdminRespondToAuthChallenge`, `AdminCreateUser`, `AdminAddUserToGroup`,
  `AdminListGroupsForUser`, `AdminDisableUser`, `AdminEnableUser`,
  `ListUsers`, `ListUsersInGroup`, `DescribeUserPool`, `DescribeUserPoolClient`.
  (`ForgotPassword`/`ConfirmForgotPassword` deliberately excluded — Cognito
  evaluates no IAM policy for those two client-level actions at all.)
- The User Pool ID, App Client ID, and App Client Secret themselves.

A real end-to-end login (including the first-login forced password change
for a freshly admin-created account) is a go-live checklist item once those
land — not something mockable past with a fake client.

## Update (2026-09-24) — Forgot-password, admin user management, MFA, and a deploy template

Everything remaining that was buildable without real AWS access has now
been built:

- **Forgot-password** (`POST /api/auth/forgot-password`,
  `POST /api/auth/confirm-forgot-password`) — Cognito's self-service reset.
  Verified: an unknown username gets the exact same response as a known one
  (no enumeration oracle), whether the underlying Cognito call actually
  succeeds or fails for any reason — confirmed live against the real
  backend (Cognito still unconfigured, so the call fails server-side, and
  the dashboard correctly shows the identical generic message either way).
- **Admin user management** — `GET /api/auth/users` (list),
  `POST /api/auth/users/{username}/disable`, `.../enable`. API-only, no
  dashboard UI this pass (documented with `curl` examples in
  `backend/README.md`) — the existing "role matrix" panel in
  `systemSetting.js` is static mock data with nothing to extend, and a real
  admin screen is meaningfully bigger scope than everything else here.
- **MFA challenge handling** — the login flow now handles Cognito's
  `SMS_MFA`/`SOFTWARE_TOKEN_MFA` challenges (new `POST /api/auth/complete-mfa`
  + a dashboard verification-code screen), activating automatically for any
  user who has MFA enrolled once the pool exists; zero effect on accounts
  without it.
- **`backend/template.yaml`** (AWS SAM) and
  **`.github/workflows/backend-deploy.yml`** — a complete, reviewable
  deployment definition for the Lambda + API Gateway target
  `lambda_handler.py` already anticipated. Scoped tightly (DynamoDB
  read-only + the exact Cognito actions above, nothing else); deliberately
  provisions no Cognito/DynamoDB/domain/TLS resources of its own.
  **Cannot run today** — needs a GitHub OIDC deploy role and several
  secrets that don't exist yet (see the workflow file's own header comment
  for the exact list). Validated as syntactically correct YAML; not yet
  runnable end-to-end since there's no AWS deploy access to test it against.

All of this follows the same shape as everything before it: code complete,
tested wherever a fake Cognito client makes that possible, and clearly
marked wherever real AWS access is the only thing left standing between
"built" and "verified live."

## What's still blocked

- **Vendor confirmation** of the real telemetry table's `trigger_type`/event
  semantics — the current mapping is a documented best-effort guess from raw
  flags, not confirmed with the device vendor.
- **Secrets management** — credentials remain in `.env`/environment
  variables; moving to AWS Secrets Manager/SSM needs new IAM permissions not
  yet granted to `tngrama_dashboard_reader`.
- **Cognito provisioning** — see above. Login/logout (including forgot-password
  and MFA) is fully built and blocked purely on this.
- **Deployment** — `template.yaml`/`backend-deploy.yml` are ready; actually
  running them needs a chosen AWS account, a GitHub OIDC deploy role, and
  the deployment secrets listed in the workflow file. No actual deployment
  target is chosen yet (still local-only).
- **Phase 11** — go-live checklist, which depends on all of the above.

Everything else in the original 12-phase plan that didn't depend on those
items is built and verified as described above.
