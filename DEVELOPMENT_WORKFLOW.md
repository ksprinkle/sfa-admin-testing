# DEVELOPMENT_WORKFLOW.md

> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `c366e81`

Part of the [AI Engineering Handbook](CLAUDE.md). This document describes how to set up, run, test, and release this application. For system design, see [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md). For the mandatory rules and guardrails these steps operate under, see [`CLAUDE.md`](CLAUDE.md).

## Local Environment Setup

Prerequisites: Python 3.11.9 (pinned in `runtime.txt`) and a current Node.js release (no engine version is pinned in `admin-app/package.json`).

```bash
# Backend dependencies (repo root)
pip install -r api/requirements.txt

# Frontend dependencies
cd admin-app
npm install
```

Environment configuration is read from a `.env` file at the repo root; `api/config.py` falls back to `api/.env` if the root file is not present. `admin-app` uses Vite's standard `.env` / `.env.local` / `.env.production` convention.

## Running the Application Locally

```bash
# Backend — repo root, imports use the `api.*` package path
uvicorn api.main:app --reload --port 8000

# Frontend — separate shell
cd admin-app
npm run dev
```

The frontend dev server runs on port 5173 and proxies `/api` requests to `http://localhost:8000`. `scripts/start-dev-quiet.ps1` launches both processes together with reduced console output (PowerShell only).

## Testing

```bash
# Backend — repo root
python -m unittest discover tests

# Frontend — inside admin-app
npm run lint
npm run build
```

No frontend test framework is currently present in this repository (see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md)); `npm run lint` and `npm run build` are the available frontend checks. No CI runs these automatically — see `CLAUDE.md`'s Testing Expectations for what must be verified manually before work is considered complete.

## Database Migrations

Alembic (`alembic/`) is the system of record for schema changes. After modifying a model in `api/models/`:

```bash
alembic revision --autogenerate -m "<description>"
# review the generated file in alembic/versions/, then:
alembic upgrade head
```

Local development uses SQLite (`api/sfa.db`); production uses PostgreSQL. See `CLAUDE.md`'s Development Guardrails for the rule governing schema changes and `Base.metadata.create_all()`.

## Pull Requests & Review

No automated CI checks run against pull requests in this repository; review is manual. `.github/PULL_REQUEST_TEMPLATE.md` structures that review around validation evidence and regression-check confirmation.

## Release Process

Three PowerShell scripts, run in sequence from the repo root:

1. **`scripts/release-preflight.ps1`** — verifies the working tree is clean, runs a Python syntax check (`compileall`) across `api/`, and (unless run with `-SkipFrontendBuild`) builds the frontend (`npm ci && npm run build` in `admin-app`). This step checks that the code compiles and builds — it does not run the test suite.
2. **`scripts/create-release-tag.ps1`** — runs preflight (unless skipped), confirms the target tag does not already exist, creates an annotated git tag, and optionally pushes it.
3. **`scripts/generate-release-summary.ps1`** — generates a release/ops checklist markdown file (`release-notes/<version>.md`) with build metadata and a pre-event verification checklist.

Because preflight does not run the test suite, run `python -m unittest discover tests` manually before creating a release tag.

## Deployment

- **Backend** deploys to Render.com from `render.yaml` (the `sfa-api` web service and `sfa-db` PostgreSQL database). As of 2026-07-19, `render.yaml`'s `preDeployCommand` runs `alembic upgrade head` before each new release takes traffic — before that, no migration step existed anywhere in the deploy process (see `KNOWN_TECHNICAL_DEBT.md`).
- **Frontend** is built with `npm run build` inside `admin-app`, which writes output to the repo-root `docs/` folder; publishing requires committing and pushing that output, which GitHub Pages then serves from `master`. This is a manual step — `npm run deploy` performs the build but does not commit or push.

Full deployment topology and rationale → [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md).

## Email Delivery

`api/services/email_delivery.py` provides two providers behind one abstraction, selected entirely by environment variable — no code change needed to switch: `EmailNoopProvider` (fabricates a fake success, sends nothing — the default, correct for local dev and any environment without real SMTP configured) and `SMTPEmailProvider` (real SMTP, STARTTLS or SSL).

**Because `sfa-api` is not Blueprint-synced to this repo** (see `KNOWN_TECHNICAL_DEBT.md`'s `preDeployCommand` postmortem), the variables below are declared in `render.yaml` for documentation purposes only — they do **not** get applied automatically. Set them by hand in the Render dashboard: `sfa-api` → **Environment** → **Environment Variables** → **Edit**.

| Variable | Example (Gmail) | Notes |
|---|---|---|
| `EMAIL_PROVIDER_KEY` | `email.smtp` | Selects `SMTPEmailProvider`. Leaving this unset (or `email.noop`) is fine for local/dev — **production refuses to start** if it resolves to the no-op provider (`api/main.py`'s `_enforce_startup_guardrails`). |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `587` | STARTTLS port. Leave `SMTP_USE_SSL` unset/`false` — it can't be combined with `SMTP_USE_TLS` (the default, `true`). |
| `SMTP_USERNAME` | `sfa.app.testing@gmail.com` | |
| `SMTP_PASSWORD` | *(Gmail App Password)* | **Secret — set only in the Render dashboard, never committed.** See below for how to generate one. |
| `EMAIL_DEFAULT_SENDER` | `sfa.app.testing@gmail.com` | The actual sender/envelope address used everywhere email is sent — note this is the variable that matters, **not** `SMTP_FROM_ADDRESS` (declared in `api/config.py` but not referenced anywhere in the send path — dead configuration, don't set it expecting it to do anything). |
| `EMAIL_SENDER_DISPLAY_NAME` | `Surfers For Autism` | Optional. Adds a friendly name to the `From:` header only (`Surfers For Autism <sfa.app.testing@gmail.com>`) — the envelope sender stays the bare `EMAIL_DEFAULT_SENDER` address either way. Leave unset for no display name. |

**Generating a Gmail App Password** (required — Gmail rejects SMTP auth with the account's normal password): the Google Account must have 2-Step Verification enabled first, then Google Account → Security → 2-Step Verification → App passwords → create one scoped to "Mail" → use the generated 16-character value as `SMTP_PASSWORD` (spaces don't matter, Google accepts it either way).

**Deployment steps**: set the variables above in the Render dashboard → trigger a deploy (or push a commit) → check the Application log for the boot-time diagnostic lines (`Email provider: email.smtp`, `SMTP enabled: True`, `Sender address: ...` — never the password) → run through Release Verification below, including an actual send.

**Swapping the sender later** (e.g. once the organization's real domain is available) needs no code change — just update `EMAIL_DEFAULT_SENDER` (and `EMAIL_SENDER_DISPLAY_NAME` if desired) in the dashboard and redeploy.

## Release Verification

Run after every production deploy — a couple of minutes, and it's the step that would have caught the 2026-07-19 migration-drift incident immediately instead of several slices later (see `KNOWN_TECHNICAL_DEBT.md`'s postmortem). Use the existing published **"Fake Event Test"** event for the registration check, never a real chapter event, and the standing verification account (`kellysprinkle2016+release-check@yahoo.com` — a `+`-tagged alias of a real inbox, `role=participant`; password is in the project maintainer's password manager, not in this repo) rather than registering a fresh one each time (registering repeatedly trips `/auth/register`'s own rate limiter, 5 requests/15 min).

- [ ] **Deploy completed successfully** — Render dashboard, `sfa-api` service: latest deploy shows the build, `preDeployCommand`, and start steps all green.
- [ ] **Alembic is actually at head** — Render Shell: `alembic current` matches `alembic heads` exactly, no divergence. **This is the one check that would have caught the incident** — every check below can pass while this is silently wrong, because `Base.metadata.create_all()` (still running on every boot) papers over missing tables even when columns on pre-existing tables are missing.
- [ ] **Anonymous registration works** — `POST /api/public/events/fake-event-test/register` returns `201`, not `500`.
- [ ] **Participant login works** — `POST /api/auth/login` with the standing verification account returns `200` and a token.
- [ ] **My Registrations returns 200** — `GET /api/participants/mine` with that token returns `200` (empty list is fine).
- [ ] **Admin dashboard loads** — sign in to the deployed admin app, confirm `/` renders with no browser console errors.
- [ ] **Participant list loads** — the Participants page (or `GET /api/admin/participants/...`) renders for an event that has data.
- [ ] **Waiver workflow verified** — `GET /api/waivers/sign/{token}` for a valid signing token returns `status: "ready"` with the waiver text populated (or complete a real test sign for full confidence).

Quick copy/paste for the API-only checks (replace `$API`, `$EMAIL`, `$PASSWORD` with the deployed API base URL and the standing verification account):

```bash
API="https://sfa-admin-testing.onrender.com"

curl -s -o /dev/null -w "anonymous register -> %{http_code}\n" -H "Content-Type: application/json" \
  -d '{"first_name":"Release","last_name":"Check","email":"release-check-'"$(date +%s)"'@example.com"}' \
  "$API/api/public/events/fake-event-test/register"

TOKEN=$(curl -s -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$EMAIL&password=$PASSWORD" "$API/api/auth/login" | python -c "import json,sys; print(json.load(sys.stdin)['access_token'])")

curl -s -o /dev/null -w "My Registrations -> %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$API/api/participants/mine"
```

## Utility Scripts

- `scripts/seed-feedback-scenarios.py` — seeds sample feedback records for demo/QA purposes.
- `create_sessions.py`, `create_session_assignments.py` (repo root) — standalone data-setup scripts, used ad hoc rather than as part of a recurring documented workflow.

## Definition of Done

A feature or fix is complete when:

- The requested scope is implemented, with no unrelated changes bundled in.
- Existing architecture and conventions are preserved, per `ARCHITECTURE_OVERVIEW.md`, unless deviation was justified per `CLAUDE.md`'s Mandatory Engineering Rules.
- Backend tests and frontend checks pass, per the Testing section above and `CLAUDE.md`'s Testing Expectations.
- Any handbook document the change invalidates is updated in the same change.
- The change is prepared as one logical commit.
- The result is ready for review or deployment, with no unresolved guardrail violations.
