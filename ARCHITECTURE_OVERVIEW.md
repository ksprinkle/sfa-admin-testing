# ARCHITECTURE_OVERVIEW.md

> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `c366e81`

Part of the [AI Engineering Handbook](CLAUDE.md). This document describes how the system is built: layering, data model, auth, and deployment. For repository navigation and guardrails, see [`CLAUDE.md`](CLAUDE.md). For what each feature does and where it lives, see [`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md). For known gaps referenced below, see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md).

## System Overview

```
 admin-app (React SPA)              api (FastAPI)                  Database
 served from GitHub Pages    HTTPS/JSON, bearer JWT    served on   SQLite (dev)
      ─────────────────────────────────────────────▶  Render.com  Postgres (prod)
      ◀─────────────────────────────────────────────
      ◀ ─ ─ ─ ─ ─ ─ WebSocket broadcast ─ ─ ─ ─ ─ ─ ─
```

One backend process (`api/`, FastAPI) serves a JSON API consumed by one frontend SPA (`admin-app/`, React). The two are deployed independently — see [Deployment Topology](#deployment-topology) — and communicate only over HTTPS and a single WebSocket channel for live updates. There is no server-side rendering, no BFF layer, and no message queue; all cross-cutting behavior (retries, notifications) runs in-process within the API.

## Backend Architecture

**Layering:** Router → Service → CRUD/ORM → Database is the current preferred pattern. Routers handle HTTP concerns and permission checks (via `require_admin` / `require_permission(...)` dependencies); services hold business logic; the ORM and Pydantic schemas (`api/schemas/`, kept separate from `api/models/`) handle persistence and validation.

A thin `api/crud/` layer (events, participants) predates this convention and still carries some business logic directly rather than delegating to `api/services/` — this reflects an earlier implementation style rather than the current target pattern. New work in these feature areas should generally follow the Router → Service → CRUD/ORM pattern; existing `api/crud/` logic does not need to be migrated as a prerequisite for unrelated changes.

Example of the intended shape: a check-in mutation in `api/routers/admin_participants.py` is gated by a permission dependency, delegates capacity/eligibility logic to `api/services/session_recommender.py` and `api/services/assignment_evaluator.py`, persists through the ORM, and broadcasts the result over the WebSocket channel — new feature work should follow this shape.

**Configuration:** environment-variable driven (`api/config.py`), fails fast at import time on invalid or unsafe production configuration. Production-specific rules (forbidden SQLite, required secrets, dev-route lockout) are enforced in code — see `CLAUDE.md`'s Development Guardrails for the rules themselves.

**Database & migrations:** SQLAlchemy 2.0 ORM; SQLite locally, PostgreSQL in production. Alembic (`alembic/`) is the migration system of record; `api/main.py` also calls `Base.metadata.create_all()` on every boot as a local-dev safety net. See `CLAUDE.md`'s Development Guardrails for the resulting rule and [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md) for the associated risk.

**Real-time updates:** a minimal WebSocket broadcast channel (`api/ws_manager.py`) — a single in-memory connection manager, no auth, no per-client scoping. Routers that mutate roster/session state call `manager.broadcast(...)` after committing, so all connected admin clients receive every update. This is a simple pub/sub, not a scoped event system.

## Reliability & Telemetry Subsystem

Notification and reminder delivery runs through a staged, generic execution pipeline rather than being dispatched inline: `execution_pipeline.py` → outcome classification (`execution_outcomes.py`) → retry decision (`retry_decision.py`) → circuit breaker (`circuit_breaker.py`, per-provider failure tracking) → failover (`failover_execution.py`), with every stage emitting telemetry events to a SQL-backed store (`telemetry_store.py`). The operational dashboards (`dashboard_service.py` and related) are built entirely by aggregating this telemetry — they do not read delivery state directly. This subsystem is the most heavily unit-tested part of the codebase (see `tests/`) and is the intended pattern for any future work involving retries or delivery reliability.

## Data Model

Core entities and how they relate — not an exhaustive list of the ~30 model files (see `api/models/` for the complete set; `FEATURE_INVENTORY.md` links each feature to its owning models).

| Entity | Relationship | Notes |
|---|---|---|
| `Event` | 1:N `Session`, 1:N `Participant` | Counts (`surfer_count`, `waitlist_count`, etc.) are computed Python properties, not SQL aggregates |
| `Session` | belongs to `Event` | Capacity-bound; participants are assigned into sessions |
| `Participant` | belongs to `Event`, optional `Session`; 1:1 `ParticipantWaiver` | Central entity; soft-deleted (`removed_at`/`reason_code`/`stage`), never hard-deleted; unique on `(event_id, email)` |
| `ParticipantWaiver` | 1:1 `Participant`; fans out to audit events, PDF artifacts, signing tokens, deliveries | Explicit lifecycle state machine (`draft → sent → viewed → signed → archived/superseded`) |
| `User` | flat `role` field | No roles table — role is a string checked against a static permission map (`api/services/authorization.py`) |
| `ParticipantRemovalLog` | references `Event` | Append-only removal/no-show audit; `event_id` is stored as text against `Event.id`'s UUID type — a known FK-typing inconsistency, see `KNOWN_TECHNICAL_DEBT.md` |
| `VolunteerProfile` / `VolunteerAvailability` / `VolunteerAssignment` | independent volunteer system of record | Coexists with `Participant(role="volunteer")` for event-day signup — two parallel volunteer concepts, see `KNOWN_TECHNICAL_DEBT.md` |
| `CommunicationTemplate` / `CommunicationMessage` / `CommunicationDelivery`, `ReminderDefinition` / `ReminderExecutionQueue` | messaging/reminders subsystem | Delivery goes through the Reliability & Telemetry pipeline above |
| `AutomationWorkflow` / `AutomationRun` | workflow engine persistence | |
| `TelemetryRecord` | generic event-sourcing table | `event_type` / `category` / `payload` (JSON) — backs all dashboards |

Conventions: primary keys are UUIDs (via the Postgres UUID column type, used even under local SQLite); child records typically cascade-delete with their parent (`cascade="all, delete-orphan"`) except where soft-delete applies; computed/aggregated views (dashboards, timelines, volunteer projections) are read-only projections over these tables and never persist their own state.

## Frontend Architecture

React 19 SPA built with Vite, no state-management library — component state (`useState`/`useEffect`) plus `localStorage` for persisted UI preferences, and a custom `auth:changed` window event used to keep auth state in sync across components and tabs. Routing via React Router 7, defined in `admin-app/src/App.jsx`; route-level auth gating is inline (`if (!token) redirect to /login`), not a dedicated guard component.

API access goes through a single `fetch`-based client (`admin-app/src/api/api.js`) with per-domain modules (`events.js`, `communications.js`, etc.) layered on top; a `401` response clears the session and redirects to login. `admin-app/src/api/baseUrl.js` resolves the API origin per environment and explicitly rejects private/loopback URLs in production builds.

PWA scaffolding (manifest, service worker) exists in `admin-app/public/`, but the service worker is deliberately unregistered at runtime (`main.jsx`, "stability-first mode: keep production clients uncached to avoid stale GitHub Pages bundles") — the app is installable but not currently offline-capable in practice.

## Auth & Authorization

Stateless JWT via OAuth2 password flow: `POST /api/auth/login` issues a signed token (`python-jose`, HS256); `api/dependencies.py`'s `get_current_user` decodes it and loads the user from the database on every request (no session cache, no refresh tokens). Authorization is role-based, not scope-based: `api/services/authorization.py` maps two roles today (`participant`, `admin`) to a fixed set of permission strings (e.g. `events.manage`, `waivers.manage`); routers enforce access via `require_admin` / `require_permission(...)` FastAPI dependencies. Finer-grained permission constants exist in the map but no additional roles are wired up yet. The frontend stores the token and profile in `localStorage` and treats a `401` as a hard logout.

## Deployment Topology

No containers; two independently deployed halves:

- **Backend** (`api/`) — Render.com web service, `uvicorn api.main:app`, backed by a managed Render PostgreSQL database (`render.yaml`). Configuration is environment-variable driven; production behavior is enforced by the guardrails in `CLAUDE.md`.
- **Frontend** (`admin-app/`) — built by Vite directly into the repo-root `docs/` folder and served by GitHub Pages from `master`. Deployment is a manual build-and-commit, not an automated pipeline (no CI exists in this repository).

## Known Architectural Quirks

Two further conditions worth knowing before working nearby, beyond what's already noted inline above: the `api/automation/` subpackage exists only as compiled bytecode, with no `.py` source present in the working tree, and no worker/cron service is defined in the deployment topology despite the reminder-execution-queue data model existing (see Data Model above).

Full detail and current status for these and other known conditions (including `create_all()`/Alembic coexistence and the volunteer/`ParticipantRemovalLog` notes above): [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md).
