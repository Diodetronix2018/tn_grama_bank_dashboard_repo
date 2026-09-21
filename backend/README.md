# TN Grama Bank — Branch Data API

Serves branch-security records to the dashboard at `../tngb-dashboard`. Can
run against deterministic mock data or the real DynamoDB table
(`DATA_SOURCE`, see Configuration below) — see `/IMPLEMENTATION.md` at the
repo root for the full picture.

## Run it locally

```
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

Then open `../tngb-dashboard/index.html` (via `python -m http.server 8000` in
that folder) — it's already configured to fetch from `http://127.0.0.1:8787`.

## Test

```
pytest -q
```

The suite is hermetic — `tests/conftest.py` forces `DATA_SOURCE=mock` before
anything imports the app, regardless of what's in your local `.env`, so
running tests never makes a real AWS call.

## Lint and security scan

```
ruff check .
bandit -r app -ll
```

Both run in CI (`.github/workflows/backend-ci.yml`) alongside `pytest` and
`pip-audit`.

## Check for known-vulnerable dependencies

```
pip-audit -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and adjust. Key settings:

| Setting | Purpose |
| --- | --- |
| `DATA_SOURCE` | `mock` (default, no AWS needed) or `dynamodb` |
| `API_KEYS` | Comma-separated keys the dashboard must send as `X-API-Key` |
| `CORS_ALLOW_ORIGIN` | The one origin allowed to call this API |
| `AWS_REGION`, `DYNAMODB_TABLE_NAME` | Only read when `DATA_SOURCE=dynamodb` |
| `ENVIRONMENT` | `development` (default, exposes `/docs`) or `production` (disables `/docs`/`/redoc`/`/openapi.json`) |
| `TRUST_PROXY_HEADERS` | `false` (default). Only set `true` once a specific single-hop reverse proxy/load balancer is confirmed in front of this app — see `app/security.py`'s `get_client_ip()`. |
| `BRANCHES_CACHE_TTL_SECONDS` | How long `list_branches()` results are cached in-process (default `60`) before re-querying the data source |

## Known limitations (deliberate)

- **Rate limiting and the branches cache are both in-memory, single-process.**
  Neither coordinates across multiple uvicorn workers or multiple instances
  behind a load balancer — accepted for now since no multi-instance
  deployment target is chosen yet. Revisit (e.g. a shared Redis store) only
  once one is.
- **Secrets live in `.env`/environment variables**, not AWS Secrets Manager
  or SSM Parameter Store. The current IAM user (`tngrama_dashboard_reader`)
  only has DynamoDB permissions — moving secrets to a managed store needs
  new IAM permissions granted first. `SecretStr` (see `app/config.py`) keeps
  the raw value out of accidental logs/reprs in the meantime.

## Before any non-local deployment

1. Set `ENVIRONMENT=production` (disables `/docs`, `/redoc`, `/openapi.json`).
2. Confirm `TRUST_PROXY_HEADERS` matches the actual network topology — only
   `true` if exactly one trusted reverse proxy/load balancer sits directly
   in front of this app.
3. Rotate `API_KEYS` off the local-dev default.

## Verify real AWS credentials (one-off)

Once real credentials are in `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `DYNAMODB_TABLE_NAME`), confirm they actually work before doing
anything else with them:

```
python -m scripts.check_aws_connection
```

This checks the identity (`sts:GetCallerIdentity`) and table access
(`dynamodb:DescribeTable`) and prints a clear pass/fail message — it does not
start a server, does not read `DATA_SOURCE`, and has no effect on the running
app either way. Add `--sample-item` to also print one real row (for the
separate, later schema-mapping work) — off by default.

## Switching to the real DynamoDB table

1. Set `DATA_SOURCE=dynamodb`, `AWS_REGION`, `DYNAMODB_TABLE_NAME`, and (for a
   static IAM-user key pair, as opposed to an attached role) `AWS_ACCESS_KEY_ID`
   / `AWS_SECRET_ACCESS_KEY` in `.env`.
2. Restart the process — `get_settings()`/`get_data_source()` are cached
   singletons, so an already-running server won't pick up an edited `.env`.
3. The real table's mapping is already implemented in
   `app/data/dynamodb_source.py` — its module docstring documents exactly
   what's derived, what's a best-effort/provisional assumption (event/status
   derivation from raw flags, the 15-minute staleness threshold), and what's
   deliberately not mapped yet (zone-level detail).

No other file changes — the API layer, auth, and the frontend are all
already written against the `DataSource` interface, not against DynamoDB
directly.
