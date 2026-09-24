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

Then serve `../tngb-dashboard` via `python -m http.server 8000` in that
folder and open `http://localhost:8000` (**not** `file://` and **not**
`127.0.0.1`) — the dashboard now requires signing in, and the session
cookie is `Secure`+`SameSite=Strict`, which needs `localhost` on both sides
to be treated as the same site (`127.0.0.1` is a different site to a
browser even though it's the same machine). The API itself stays on
`http://localhost:8787`, matched by `tngb-dashboard/src/data/liveSource.js`.

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
| `CORS_ALLOW_ORIGIN` | The one origin allowed to call this API |
| `AWS_REGION`, `DYNAMODB_TABLE_NAME` | Only read when `DATA_SOURCE=dynamodb` |
| `ENVIRONMENT` | `development` (default, exposes `/docs`) or `production` (disables `/docs`/`/redoc`/`/openapi.json`, and requires a strong `SESSION_SECRET_KEY`) |
| `TRUST_PROXY_HEADERS` | `false` (default). Only set `true` once a specific single-hop reverse proxy/load balancer is confirmed in front of this app — see `app/security.py`'s `get_client_ip()`. |
| `BRANCHES_CACHE_TTL_SECONDS` | How long `list_branches()` results are cached in-process (default `60`) before re-querying the data source |
| `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `COGNITO_APP_CLIENT_SECRET` | Identity provider for login. Empty by default — see "Login (Cognito)" below |
| `SESSION_SECRET_KEY` | HMAC key for the dashboard's own session cookie (not a Cognito credential) — must be long and random before `ENVIRONMENT=production` |
| `SESSION_TTL_MINUTES` | How long a signed-in session lasts (default `30`) |
| `LOGIN_RATE_LIMIT` | Tighter than the general rate limit, just for `/api/auth/login` (default `5/minute`) |

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

1. Set `ENVIRONMENT=production` (disables `/docs`, `/redoc`, `/openapi.json`,
   and fails fast at startup unless `SESSION_SECRET_KEY` is a long random
   value — generate one with
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
2. Confirm `TRUST_PROXY_HEADERS` matches the actual network topology — only
   `true` if exactly one trusted reverse proxy/load balancer sits directly
   in front of this app.
3. Confirm the dashboard and this API end up on the same registrable
   domain (or at least the same `localhost`-style host) — the session
   cookie is `SameSite=Strict`, which silently won't be sent across a
   same-machine-but-different-site mismatch (see "Run it locally" above).

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

## Login (Cognito)

The dashboard requires signing in — `/api/branches` and everything else
needs a valid session, issued by `/api/auth/login` after checking real
credentials against an AWS Cognito User Pool. There's no self-registration:
accounts are created by an admin via `POST /api/auth/users`.

**Nothing about Cognito exists in AWS yet.** `COGNITO_USER_POOL_ID`/
`COGNITO_APP_CLIENT_ID`/`COGNITO_APP_CLIENT_SECRET` stay blank until a User
Pool and App Client are provisioned — see `/IMPLEMENTATION.md` at the repo
root for the exact request list (password policy, which auth flows to
enable, and the IAM permissions needed). Until then, `/api/auth/login`
responds with a generic 500 (logged server-side, nothing leaked to the
client) rather than a working login — this is expected, not a bug.

Once real values are in `.env`, verify them before anything else:

```
python -m scripts.check_cognito_connection
```

Same role as `check_aws_connection.py` above: read-only, standalone, prints
a clear pass/fail, has no effect on the running app.

### Password reset and MFA

`POST /api/auth/forgot-password` / `POST /api/auth/confirm-forgot-password`
implement Cognito's self-service reset — `forgot-password` always returns
the same generic message regardless of whether the username exists, so it
can never be used to check which accounts are registered. If a user has
MFA enrolled (the pool is provisioned `MfaConfiguration=OPTIONAL`), login
returns `{"status": "mfa_required", ...}` instead of a session, and
`POST /api/auth/complete-mfa` finishes it — this activates automatically
per-user, with no effect on accounts that don't have MFA enrolled.

### Admin: manage users (API only)

No dashboard screen for this yet — call these directly with a signed-in
admin's session cookie:

```
# List all users
curl -b "tngb_session=<cookie>" http://localhost:8787/api/auth/users

# Disable / re-enable one
curl -b "tngb_session=<cookie>" -X POST http://localhost:8787/api/auth/users/someone%40example.com/disable
curl -b "tngb_session=<cookie>" -X POST http://localhost:8787/api/auth/users/someone%40example.com/enable
```

(`%40` is a URL-encoded `@` — Cognito usernames here are email addresses.)

## Deploying

`template.yaml` (AWS SAM) defines the Lambda + API Gateway deployment
`lambda_handler.py` already anticipates, and
`.github/workflows/backend-deploy.yml` runs it via `sam build && sam deploy`
on a tag push or manual trigger. **Neither can run successfully yet** — see
the workflow file's header comment for the exact list of missing secrets
(a GitHub OIDC deploy role plus the Cognito/session values). Once those
exist, a manual deploy looks like:

```
sam build --use-container
sam deploy --guided
```

The template deliberately provisions nothing beyond the application layer
already in this repo — the Cognito User Pool, the DynamoDB table, a custom
domain/TLS certificate, and CloudFront all stay separate, AWS-admin-owned
setup steps (see `/IMPLEMENTATION.md`'s request list). Once deployed, the
Lambda's own execution role replaces the static `AWS_ACCESS_KEY_ID`/
`AWS_SECRET_ACCESS_KEY` dev credentials entirely — `DynamoDBDataSource` and
`CognitoClient` already fall back to boto3's default credential chain
whenever those two are blank, so no code changes are needed for that
transition.

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
