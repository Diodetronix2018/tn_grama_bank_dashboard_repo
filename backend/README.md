# TN Grama Bank — Branch Data API

Serves branch-security records to the dashboard at `../tngb-dashboard`. Runs
against deterministic mock data today; swaps to the real DynamoDB table by
changing one setting once the client-provided AWS details land (see
`/IMPLEMENTATION.md` at the repo root for the full picture).

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
