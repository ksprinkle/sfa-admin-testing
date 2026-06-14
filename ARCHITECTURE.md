# Surfers For Autism - Architecture (Phase 3 Baseline)

This document describes the implemented architecture at the Phase 3 baseline candidate for v1.1.0.

## System Shape

Admin UI (React/Vite)
-> Read-only and operational API calls
-> FastAPI services and routers
-> SQLAlchemy models over canonical domain tables
-> SQLite (local dev) / PostgreSQL (production)

## Architectural Layering

Canonical Domain Data
        |
        |- Waiver Lifecycle
        |- PDF Preservation
        |- Participant Timeline
        |- Volunteer Projection
        |- Waiver Reporting
        |- Event Summaries
        |
        v
Executive Analytics Projection
        |
        v
Read-only Administrative UI

## Canonical Domain Data (System of Record)

Canonical data is persisted in domain models and tables (participants, events, sessions, waiver entities, audit events, PDF artifacts, and related records).

Rules:
- Canonical domain models are the source of truth.
- Projection services do not become systems of record.
- Read-only dashboards do not persist computed results.

## Phase 3 Implemented Capability Areas

### 1) Waiver Lifecycle

- Bounded context: waiver templates with states draft, active, archived.
- Immutability: active and archived templates are read-only.
- Single active template enforcement with lineage through supersedes_template_id.

Primary implementation surfaces:
- api/models/waiver_templates.py
- api/services/waiver_template_lifecycle.py
- api/routers/admin_waiver_templates.py

### 2) Immutable PDF Preservation and Provenance

- Signed waiver PDF artifacts are immutable.
- Artifact metadata includes template linkage and content hash provenance.
- Verification reports integrity, provenance, and storage status.

Primary implementation surfaces:
- api/models/waiver_pdf_artifacts.py
- api/services/waiver_pdf_archive.py
- api/services/waiver_template_provenance.py
- api/routers/waivers.py

### 3) Participant Timeline Projection (Read-Only)

- Timeline is a projection built from canonical participant/waiver/audit/artifact data.
- Deterministic ordering via event timestamp + sort key.
- Stable event contract includes PDF_VERIFIED.

Primary implementation surfaces:
- api/services/participant_timeline.py
- api/schemas/participant_timeline.py
- api/routers/admin_participants.py

### 4) Volunteer Operational Projection (Read-Only)

- Volunteer status is computed, never persisted.
- Locked precedence: ACTION_REQUIRED > INCOMPLETE > CHECKED_IN > READY.
- Compliance explicitly reports Not Tracked when unsupported.

Primary implementation surfaces:
- api/services/volunteer_dashboard_projection.py
- api/schemas/volunteer_dashboard.py
- api/routers/admin_participants.py

### 5) Executive Analytics Projection (Read-Only)

- Executive metrics are projection outputs derived from canonical data and existing projections.
- No stored counters or materialized analytics tables introduced.
- Metrics expose data source metadata and not-tracked flags where applicable.

Primary implementation surfaces:
- api/services/executive_analytics_projection.py
- api/schemas/executive_analytics.py
- api/routers/admin_analytics.py

## Governance Model

- PROJECT_SYNC_BRIEF.md is implementation truth.
- ROADMAP_INTENT.md is planning-only unless commit-backed.
- Scope is enforced one approved feature at a time.
- Stabilization gates verify baseline integrity before new phase work.
