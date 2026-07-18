# CLAUDE.md

> **Document type:** AI Engineering Handbook — entry point
> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `c366e81`

This is the first document any AI assistant should read in this repository. It is short by design — depth lives in the other handbook documents it points to.

New to this repository? Read [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) and [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) before making your first change.

## Project Overview

The SFA Admin PWA is an internal administration application for Surfers for Autism, supporting staff and volunteers across event planning, participant and volunteer management, session assignment, day-of check-in, waiver verification, communications, and executive reporting for surf therapy events.

Full mission context, terminology, and the versioning scheme → [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

## Repository Navigation

| Path | Directory Status | Role |
|---|---|---|
| `api/` | **Live** | FastAPI backend. All backend work happens here. |
| `admin-app/` | **Live** | React/Vite frontend. All frontend work happens here. |
| `backend/` | Dead | Superseded; contains only a stale `__pycache__`, no source. Do not use. |
| `frontend/` (root) | Dead | Superseded vanilla-JS prototype, last touched 2026-04-23. Do not use. |
| `docs/` (root) | Generated | GitHub Pages build output of `admin-app` (`vite build`, `outDir: '../docs'`). Never hand-edit; regenerate via `npm run build`. |
| `admin-app/docs/` | Stale duplicate | Not the real deploy target — see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md). Do not treat as authoritative or update manually. |
| `alembic/` | Live | Database migrations. |
| `tests/` | Live | Backend test suite (imports `api.*`). |
| `scripts/` | Live | Release and local-dev tooling. |

Key entry points: [`api/main.py`](api/main.py) (app setup, router mounting, startup guardrails), [`admin-app/src/App.jsx`](admin-app/src/App.jsx) (routing, top-level layout), [`admin-app/src/main.jsx`](admin-app/src/main.jsx) (entry point, service-worker handling).

System design, data model, and how these pieces fit together → [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md). What each feature area does and where it lives → [`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md).

## Development Guardrails

Mandatory. These protect production correctness and safety — do not work around them.

1. **Never target SQLite in production.** `api/config.py` refuses to boot without a Postgres `DATABASE_URL` when a production environment is detected. Do not weaken or bypass this check.
2. **Never enable dev-only routes or debug mode in production.** `api/main.py`'s `_enforce_startup_guardrails()` raises `RuntimeError` if `DEBUG=true` or a `/api/auth/dev/*` route is reachable while `DEV_ROUTES_ENABLED` is false, in a detected-production environment. This is intentional defense, not a bug.
3. **Schema changes require a real Alembic migration, and it must be idempotent.** Do not rely on `api/main.py`'s unconditional `Base.metadata.create_all()` call for schema changes — any new table, column, or constraint needs a corresponding revision in `alembic/versions/`. Every migration that adds a nullable column or a new table must use the project's guarded pattern — check `has_table`/`has_column` via `sqlalchemy.inspect()` before `create_table`/`add_column` (e.g. `alembic/versions/a5f2c8e1b9d3_add_user_id_to_participants.py`) — unless there is a compelling, explicitly documented reason it cannot be. This is not style guidance: an unguarded migration, silently skipped by an `alembic stamp`, caused a real production outage (`KNOWN_TECHNICAL_DEBT.md`'s 2026-07-19 postmortem) — guarded migrations are safe to replay under exactly that failure mode, unguarded ones are not. See [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md) for the full incident and why this matters.
4. **Never add secrets to a tracked `.env` file.** `admin-app/.env`, `admin-app/.env.production`, and `api/.env` are already tracked in git — a known issue (see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md)). Do not compound it with real credentials.
5. **Do not use `backend/` or `frontend/` (root).** They are dead. Do not add to them, import from them, or "fix" them. If a task seems to require touching them, stop and confirm with the user first.
6. **Do not hand-edit `docs/` or `admin-app/docs/`.** They are build artifacts, not source.

## Mandatory Engineering Rules

Process rules derived from this project's engineering philosophy. Full rationale → [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

1. Preserve existing architecture; extend rather than replace it.
2. Scope every change to the smallest practical vertical slice. One logical feature per commit.
3. Never perform a repository-wide refactor unless the user explicitly requests it.
4. Historical documents are read-only: never edit Phase/ADR/roadmap/baseline files, `PROJECT_SYNC_BRIEF.md`, or `NOTES.md`.
5. When a change invalidates something a handbook document describes, update that document in the same commit/PR — not as a follow-up.
6. If the implementation and a handbook document disagree, trust the implementation, then record the discrepancy in [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md) rather than silently reconciling it.
7. Deviating from rules 1–3 requires one of: a correctness bug, a security issue, or an explicit user request. Absent one of these, default to the conservative path.

## Recommended Practices

Non-blocking guidance — use judgment, but note when you deviate.

- Match the testing rigor already present in the subsystem you're touching. The execution/retry/circuit-breaker/telemetry pipeline is heavily unit-tested; most routers are not. That asymmetry is a known gap, not a precedent to extend.
- Follow the existing per-domain file split for new code — `router` / `service` / `schema` / `model` on the backend, `pages` / `components` / `api` on the frontend — rather than introducing new organizational patterns.
- Surface security-relevant observations even when fixing them is outside the current task's scope, rather than silently fixing or silently ignoring them.

## Testing Expectations

No CI exists in this repository — nothing is enforced automatically on push or PR. Verification is manual.

- **Backend:** run `python -m unittest discover tests` from the repo root before considering backend work complete.
- **Frontend:** run `npm run lint` and `npm run build` inside `admin-app/` before considering frontend work complete. No frontend test framework currently exists (see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md)) — that is a known gap, not a pattern to improvise around mid-feature.

Local environment setup, full command reference, and the release process → [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md).

Quick start, for reference:

```bash
# Backend (repo root)
pip install -r api/requirements.txt
uvicorn api.main:app --reload --port 8000

# Frontend (separate shell)
cd admin-app
npm install
npm run dev
```

## Documentation Hierarchy

When sources disagree, trust them in this order:

1. Actual code and `git log` on `master`
2. This handbook (the six documents below)
3. `PROJECT_SYNC_BRIEF.md`'s chronological narrative — the best remaining prose history, but it can lag `master` by many commits; verify anything recent against git log
4. All other root-level planning/governance material (`PHASE*.md`, `docs/ARCHITECTURE_DECISIONS.md`, `ROADMAP_INTENT.md`, `PROJECT_BASELINE_*.md`, `RELEASE_NOTES_*.md`, `NOTES.md`, root `.txt` files) — historical record only, never current, never edit

| Document | Read this for |
|---|---|
| [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) | Mission, engineering philosophy, versioning scheme, full documentation map |
| [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) | System design, data model, auth model, deployment topology |
| [`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md) | What each feature area does and where it lives in code |
| [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md) | Full local setup, commands, and the release process |
| [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md) | Known gaps and risks, and their status |
