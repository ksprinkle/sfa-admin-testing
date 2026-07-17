# KNOWN_TECHNICAL_DEBT.md

> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `67eb526`

Part of the [AI Engineering Handbook](CLAUDE.md). This document tracks known architectural, operational, and documentation debt in the current implementation — conditions that are true today and carry forward-looking risk or friction if left unaddressed.

This document tracks known technical debt. It is not intended to serve as a feature roadmap or enhancement backlog — it does not track feature requests or planned enhancements, which are decided directly with the project maintainers as they arise. An item belongs here only if it describes something about the *current* implementation, not something proposed for the future.

This is the single authoritative source for the detail and current status of every item referenced elsewhere in the handbook as a "known quirk," "known gap," or similar. Other documents may summarize an item briefly; this document owns the detail.

## Required

Debt that carries meaningful operational or security risk and should be prioritized when related work is undertaken.

| Item | Where | Debt Status | Why it matters |
|---|---|---|---|
| `admin-app/.env`, `admin-app/.env.production`, and `api/.env` are tracked in git | Repository root, `admin-app/`, `api/` | Open | Any credentials they contain are exposed in git history; contents should be audited and rotated if real secrets are present. |
| No continuous integration exists | No `.github/workflows/` → `DEVELOPMENT_WORKFLOW.md` § Pull Requests & Review | Open | Tests, lint, and build success are not enforced automatically on push or PR; verification depends entirely on the manual steps in `DEVELOPMENT_WORKFLOW.md`. |
| `Base.metadata.create_all()` runs on every backend boot alongside Alembic migrations | `api/main.py` → `ARCHITECTURE_OVERVIEW.md` § Backend Architecture, `CLAUDE.md` § Development Guardrails | Open (mitigated by the guardrail rule in `CLAUDE.md` requiring a real migration for schema changes) | Can mask a missing migration locally until it surfaces against PostgreSQL in production. A full audit (2026-07-17) compared every `Base.metadata` table/column against the entire Alembic migration history and found: `users`, `events`, `sessions`, `participants`, and `telemetry_records` had zero `create_table` coverage anywhere (they existed only via `create_all()`), and `communication_messages.audience_type` was missing its index. Fixed by filling in the previously-empty `a183b0b7b8a3_baseline_schema.py` with guarded (`has_table`-checked) `create_table`/`create_index` calls, plus a new guarded migration (`e4b3eb4e262d`) for the missing index — both no-ops against any database `create_all()` already populated (including production), verified by running `alembic upgrade head` against a genuinely fresh database end-to-end. This row stays open because the underlying mechanism (create_all() silently satisfying any future un-migrated model change) is unchanged and can reintroduce the same class of gap. |
| `npm run build` can delete historical/handbook documentation | `admin-app/vite.config.js` (`outDir: '../docs'`, `emptyOutDir: true`) → `CLAUDE.md` § Repository Navigation, `DEVELOPMENT_WORKFLOW.md` § Deployment | Open | `docs/` also holds `docs/ARCHITECTURE_DECISIONS.md` and `docs/releases/*`, which are not Vite build inputs; running the documented `npm run build` command wipes them via `emptyOutDir`, risking silent loss of historical governance records. |
| `api/services/execution_observability.py` has no source in the working tree | `tests/test_execution_pipeline.py`, `test_execution_pipeline_stages.py`, `test_telemetry_integration.py`, `test_telemetry_store.py` → `DEVELOPMENT_WORKFLOW.md` § Testing | Open | `python -m unittest discover tests` currently fails on import for these four modules; a contributor running the documented test command sees pre-existing failures unrelated to their own change. |
| Most Alembic migrations predating 2026-06 are not idempotent — they use plain `op.add_column`/`op.create_table` rather than the `inspector.has_table()`/`has_column()`-guarded pattern the newer ones (e.g. `p4a4f1d8c2b7_add_automation_foundation_tables.py`) already use | `alembic/versions/*.py` (all files except the automation/communications/volunteer-lifecycle-era ones and the two added 2026-07-17) | Open | Confirmed by test: building a fresh database purely via `Base.metadata.create_all()` (mirroring production's real history) and then running `alembic upgrade head` against it without ever stamping fails immediately on `4340172195f0_add_notes_column_to_participants` ("duplicate column name: notes"), because `create_all()` already added it and this migration doesn't check first. Any environment that boots the app (triggering `create_all()`) before ever running Alembic will hit this. Out of scope for the 2026-07-17 baseline-schema fix (retrofitting guards onto ~35 historical migration files is a repo-wide change, not a targeted one) — noted here so it isn't rediscovered from scratch. Mitigation today: always run `alembic upgrade head` (or `alembic stamp head` on a database already built by `create_all()`) before the app has a chance to boot and run `create_all()` first. |

## Accepted

Known conditions, currently living with a documented workaround or no active operational impact. Not scheduled for remediation on their own.

| Item | Where | Debt Status | Why it matters |
|---|---|---|---|
| No token revocation or refresh mechanism | `api/dependencies.py`, `api/security.py` → `ARCHITECTURE_OVERVIEW.md` § Auth & Authorization | Open | A bearer JWT cannot be invalidated before it expires. |
| No rate limiting on authentication endpoints | `api/routers/auth.py` (acknowledged via inline `#TODO`) | Open | Increases exposure to brute-force login attempts. |
| Two parallel volunteer data models exist | `VolunteerProfile`/`VolunteerAvailability`/`VolunteerAssignment`, `Participant(role="volunteer")` → `FEATURE_INVENTORY.md` § 4, `ARCHITECTURE_OVERVIEW.md` § Data Model | Open | Both represent volunteers; increases the surface area to consider when touching volunteer-related code. |
| `ParticipantRemovalLog.event_id` is stored as text rather than a typed foreign key against `Event.id` (UUID) | `ParticipantRemovalLog` → `ARCHITECTURE_OVERVIEW.md` § Data Model | Open | Requires manual casting in router code; a source of friction if the removal-log schema is touched. |
| Dead code present in the working tree | `backend/app/services/__pycache__` (no source); `api/index.html`, `api/vite.config.js`, `api/src/` (generated scaffold) → `CLAUDE.md` § Repository Navigation | Open | No functional risk; adds navigation overhead for anyone unfamiliar with the repository. |
| `admin-app/docs/` is a stale duplicate of the repo-root `docs/` build output | `admin-app/docs/` → `CLAUDE.md` § Repository Navigation, `ARCHITECTURE_OVERVIEW.md` § Deployment Topology | Open | Not the real GitHub Pages deploy target; could be mistaken for authoritative build output and edited or relied upon in error. |
| `npm run lint` scans generated build output, not just source | `admin-app/eslint.config.js` (`globalIgnores(['dist'])` does not cover `admin-app/docs/`) → `DEVELOPMENT_WORKFLOW.md` § Testing | Open | `eslint .` (the documented lint command) walks the minified bundles committed under the stale `admin-app/docs/` duplicate, producing several hundred false-positive errors unrelated to any source change. Discovered 2026-07-17 during Automation Management UI closeout validation; worked around by linting `src/` directly (`npx eslint src`) rather than the documented command. Not fixed as part of that feature since it requires a repo-wide `eslint.config.js` ignore-list change, out of scope for a frontend feature slice. |
| `api/automation/` subpackage exists only as compiled bytecode, with no `.py` source in the working tree | `api/automation/` → `ARCHITECTURE_OVERVIEW.md` § Known Architectural Quirks, `FEATURE_INVENTORY.md` § 10 | Open | Its runtime status (in use, unused, or partially present) is unconfirmed; worth resolving before building on it. |
| No automated frontend test coverage | `admin-app/` → `DEVELOPMENT_WORKFLOW.md` § Testing | Open | Frontend regressions rely entirely on manual verification, `npm run lint`, and `npm run build`. |
| Backend test coverage is concentrated in the reliability/telemetry subsystem | `tests/` → `ARCHITECTURE_OVERVIEW.md` § Reliability & Telemetry Subsystem | Open | Most routers (participants, events, waivers) have no automated tests; changes there rely on manual verification. |
| No worker or cron service is defined in the deployment topology, despite a reminder-execution-queue data model existing | `render.yaml` → `FEATURE_INVENTORY.md` § 8, `ARCHITECTURE_OVERVIEW.md` § Deployment Topology | Open | How queued reminders are dispatched in production is not confirmed from the repository alone. |

## Maintaining This Document

Add an item when debt is discovered; remove it when resolved rather than marking it done and leaving it in place — this document should reflect only what is true right now.
