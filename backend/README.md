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

## Switching to the real DynamoDB table

1. Set `DATA_SOURCE=dynamodb`, `AWS_REGION`, and `DYNAMODB_TABLE_NAME`.
2. Confirm the IAM role attached to wherever this runs has read access
   (`GetItem` / `Query` / `Scan`) to that table only.
3. Open `app/data/dynamodb_source.py` and adjust `_map_item` if the table's
   real attribute names differ from the shape in `app/models.py`.

No other file changes — the API layer, auth, and the frontend are all
already written against the `DataSource` interface, not against DynamoDB
directly.
