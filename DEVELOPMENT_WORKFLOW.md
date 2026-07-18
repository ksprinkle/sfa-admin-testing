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
