# Project Sync Brief
This document reflects the CURRENT WORKING STATE of the system.
Do not regress or redesign existing working infrastructure (auth, deployment, imports).

## Copilot Intake Starter

Copy and paste these 3 lines into Copilot at session start:
1. Use PROJECT_SYNC_BRIEF.md as implementation truth and current state.
2. Treat ROADMAP_INTENT.md as planning input only unless commit-backed here.
3. Implement approved items only, then update this brief with commit evidence.

## Permanent Repository Custodian Policy

This is a permanent operating policy for this repository.

### Core Role
- Treat Copilot as the repository custodian first, coder second.
- Primary responsibilities:
  - protect architecture
  - protect commit history
  - protect deployment
  - protect the sync brief
  - prevent feature mixing

### Session Start Gate (Required)
1. Run `git status`.
2. Categorize every local change into one of:
   - Source feature
   - Refactor
   - Build artifact
   - Documentation
3. If multiple categories exist:
   - STOP before coding.
   - Ask user whether to `commit`, `stash`, or `ignore` each category.
   - Do not begin implementation until user confirms handling.
4. Never mix unrelated categories into one commit without explicit user approval.

### Session End Gate (Required)
1. Run diagnostics.
2. Run build.
3. Commit only scoped changes.
4. Update `PROJECT_SYNC_BRIEF.md` with commit-backed evidence.
5. Report all remaining local changes.

### Untracked File Cleanup Rule
- During normal development, do not auto-delete untracked files unless requested.
- In designated cleanup sessions, review each untracked file and classify it as:
  - keep in source control,
  - add to `.gitignore`,
  - or delete as artifact.

## New Chat Starter (Copy/Paste)

Use this when opening a brand-new chat so session context stays aligned.

Use PROJECT_SYNC_BRIEF.md as implementation truth and current state.
Treat ROADMAP_INTENT.md as planning intent only.
Today's objective: <one sentence>.
In scope: <items>. Out of scope: <items>.
Success criteria: <list>.
Start from branch <name>, commit <hash>.
Implement now with minimal safe changes, then update PROJECT_SYNC_BRIEF.md with results and commit evidence.

## Protected Working Behavior (Copy/Paste)

Paste this into ChatGPT before asking for planning or code suggestions when the goal is to preserve current approved behavior.

Treat the following as already implemented and working as desired. Do not propose redesigns or replacement logic for these areas unless I explicitly ask for a change.
- Event/template logistics, media, report-link, and manual `map_url` support are implemented and should be preserved.
- Event Detail Map behavior is approved: manual `map_url` first, then generated coordinate/location fallback.
- Save-event-as-template now preserves logistics/media/report-link fields and backfills NOAA weather links from coordinates when needed.
- Tour templates persist the source event date in `template.date`; this is the approved source of truth for default Tour template dates.
- All Tour template calendar entry points must default to the same seed date from template creation time:
  - left Event Date card
  - right Show Date Calendar
  - Preview / Generate Annual calendars
- Tour template date fallback order is approved and should not be broadened: user-picked date, persisted `template.date`, legacy historical match only for older templates missing a stored date, then today.
- Preview/generation year should default from the seed date year, not blindly from the current year.
- Do not reintroduce broad Tour matching logic that causes different Tour templates to borrow another template's date.
- Treat current UI behavior and field placement as intentional unless a new requirement explicitly changes it.

When suggesting next steps, focus on net-new work only. Do not include already-completed features in scope unless I explicitly request revisiting them.

Date: 2026-06-07
Prepared by: GitHub Copilot (implementation record)
Branch: master
Latest implementation commit: a8c25ed
Current workspace status: local working tree contains additional uncommitted non-feature files
Previous release-prep commit: be77f16
Local release tag: v0.1.0

## Session Delta (Committed - June 13, Phase 2.1 Waiver Lifecycle Foundation) — 3c3bf91

Status: Committed

Scope guardrails:
- Built on top of v1.0.0 baseline behavior.
- No UI behavior changes.
- No email/SMS delivery.
- No PDF generation.
- No signature-capture UI.

Behavior summary:
- Expanded waiver domain lifecycle support to `draft`, `sent`, `viewed`, `signed`, `archived`, `superseded` while preserving compatibility with legacy `pending` and `verified` values.
- Added waiver lifecycle transition service with transition validation and audit-event write-through.
- Added immutable waiver audit-event structure (`waiver_audit_events`) to track status changes, actor, source, and details.
- Added derived participant waiver status computation from waiver entity + compatibility booleans.
- Preserved existing participant check-in and waiver verification workflows.

File touchpoints:
- `api/models/participant_waivers.py`
- `api/models/waiver_audit_events.py`
- `api/models/__init__.py`
- `api/services/waiver_lifecycle.py`
- `api/routers/admin_participants.py`
- `api/schemas/participants.py`
- `alembic/versions/t1c9e3a7b2d4_add_waiver_lifecycle_and_audit_events.py`
- `docs/ARCHITECTURE_DECISIONS.md`
- `PHASE2_IMPLEMENTATION_PLAN.md`

## Session Delta (Committed - June 13, Phase 2.2 Secure Signing Workflow) — 67966e2

Status: Committed

Scope guardrails:
- API/service layer only.
- No PDF generation.
- No email/SMS delivery.
- No signature canvas.
- No admin UI redesign.

Behavior summary:
- Added cryptographically random, opaque signing tokens with server-side hashed persistence.
- Added token expiration with deterministic expired-link responses for public endpoints.
- Added token-based public signing endpoints (`GET` + `POST`) without authentication.
- Added server-side token validation and replay-safe idempotent sign submission behavior.
- Added signing-token lifecycle persistence with statuses (`active`, `completed`, `expired`, `invalidated`).
- Added append-only waiver audit events for token/signing operations (`TOKEN_CREATED`, `TOKEN_VIEWED`, `TOKEN_VALIDATED`, `SIGN_SUBMITTED`, `SIGN_COMPLETED`, `TOKEN_EXPIRED`, `INVALID_ACCESS`).
- Preserved existing participant/admin workflows and existing admin waiver verification paths.

File touchpoints:
- `api/models/waiver_signing_tokens.py`
- `api/services/waiver_signing.py`
- `api/routers/waivers.py`
- `api/schemas/waivers.py`
- `api/services/waiver_lifecycle.py`
- `api/models/participant_waivers.py`
- `api/models/__init__.py`
- `api/main.py`
- `alembic/versions/u4a7d2c9e1f5_add_waiver_signing_tokens.py`
- `docs/ARCHITECTURE_DECISIONS.md`
- `PHASE2_IMPLEMENTATION_PLAN.md`

## Session Delta (Committed - June 13, Phase 2.3 Responsive Signing Interface) — 222a953

Status: Committed

Scope guardrails:
- Presentation layer only.
- Uses existing Phase 2.2 waiver token APIs.
- No backend workflow redesign.
- No PDF generation.
- No email/SMS delivery.

Behavior summary:
- Added a standalone responsive signing page for phone, tablet, and desktop at `admin-app/public/waiver-signing.html`.
- Added signature canvas support for touch, stylus, and mouse pointer input.
- Added Undo/Redo/Clear signature controls with large touch targets.
- Added typed-name fallback, required terms acceptance, and client-side validation.
- Added deterministic UI handling for invalid/expired/already-signed token states using existing API responses.
- Added temporary local draft persistence for partial form/signature state across refresh/orientation changes.
- Added accessible focus indicators, keyboard-reachable controls, and assistive labels.

File touchpoints:
- `admin-app/public/waiver-signing.html`
- `PHASE2_IMPLEMENTATION_PLAN.md`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 13, Phase 2.4 Waiver PDF Archive) — 39cf963

Status: Committed

Scope guardrails:
- Backend/service layer for immutable artifact generation and retrieval only.
- No signing workflow redesign.
- No email/SMS delivery.
- No dashboard/reporting additions.

Behavior summary:
- Added signed-only waiver PDF generation with immutable archive persistence.
- Added waiver PDF artifact metadata model (`waiver_id`, `participant_id`, version/revision, timestamp, storage path, SHA-256, byte size).
- Added admin-authorized endpoints for artifact generation, metadata retrieval, and PDF download.
- Added audit events for generation/storage/retrieval (`PDF_GENERATED`, `PDF_STORED`, `PDF_RETRIEVED`).
- Kept waiver database record as canonical source of truth.

File touchpoints:
- `api/models/waiver_pdf_artifacts.py`
- `api/models/participant_waivers.py`
- `api/models/__init__.py`
- `api/main.py`
- `api/services/waiver_pdf_archive.py`
- `api/routers/waivers.py`
- `api/schemas/waivers.py`
- `alembic/versions/v5d2a1c8f4e7_add_waiver_pdf_artifacts.py`
- `api/requirements.txt`
- `docs/ARCHITECTURE_DECISIONS.md`
- `PHASE2_IMPLEMENTATION_PLAN.md`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 13, Phase 2.5 Waiver Delivery Services) — 7d90896

Status: Committed

Scope guardrails:
- Delivery orchestration only.
- No waiver lifecycle redesign.
- No PDF generation changes.
- No reporting/dashboard/analytics scope.

Behavior summary:
- Added dedicated waiver delivery tracking model for email/SMS attempts with status persistence.
- Added template-supported delivery rendering for email subject/body and SMS body.
- Added resend capability that creates a new delivery attempt and new secure token.
- Added admin endpoints for delivery creation, resend, per-waiver list, and individual delivery retrieval.
- Added delivery audit events (`DELIVERY_CREATED`, `EMAIL_SENT`, `SMS_SENT`, `DELIVERY_FAILED`, `DELIVERY_RETRIED`, `DELIVERY_COMPLETED`).

File touchpoints:
- `api/models/waiver_deliveries.py`
- `api/models/participant_waivers.py`
- `api/models/__init__.py`
- `api/main.py`
- `api/services/waiver_delivery.py`
- `api/routers/waivers.py`
- `api/schemas/waivers.py`
- `alembic/versions/w6f3b2d8a9c1_add_waiver_deliveries.py`
- `docs/ARCHITECTURE_DECISIONS.md`
- `PHASE2_IMPLEMENTATION_PLAN.md`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Pending Commit - June 13, Phase 2.6 Waiver Observability and Reporting) — <pending_commit>

Status: Pending commit

Scope guardrails:
- Observability and reporting only.
- No waiver lifecycle redesign.
- No token security changes.
- No PDF generation flow changes.
- No delivery orchestration behavior changes.

Behavior summary:
- Added admin-authorized waiver metrics endpoint with participant/waiver completion, token expiration, and delivery success/failure counters.
- Added admin-authorized waiver analytics events endpoint aggregating waiver audit events by date and event type.
- Added admin-authorized waiver delivery CSV export endpoint for operational reporting.
- Extended admin event summary response with waiver and delivery counters for dashboard integration.

File touchpoints:
- `api/services/waiver_reporting.py`
- `api/routers/waivers.py`
- `api/schemas/waivers.py`
- `api/routers/admin_events.py`
- `api/schemas/events.py`
- `docs/ARCHITECTURE_DECISIONS.md`
- `PHASE2_IMPLEMENTATION_PLAN.md`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 14, Phase 3 Feature 1 Waiver Lifecycle Management) — 0e412b6

Status: Committed

Scope guardrails:
- Template lifecycle management only.
- No participant-linkage implementation.
- No PDF generation changes.
- No digital-signing workflow changes.
- No delivery orchestration changes.
- No timeline or analytics feature changes.

Behavior summary:
- Added a new `waiver_templates` bounded context with lifecycle states `draft`, `active`, `archived`.
- Added strict immutability guardrails: only Draft templates are editable; Active/Archived templates are read-only.
- Added no-delete lifecycle policy in app behavior (archive path only).
- Added single Active template enforcement and activation flow that auto-archives prior Active template.
- Added explicit lineage field `supersedes_template_id` for version ancestry.
- Added admin API and admin UI for create/list/update draft, preview, activate, and archive draft actions.

File touchpoints:
- `api/models/waiver_templates.py`
- `api/models/__init__.py`
- `api/main.py`
- `api/init_db.py`
- `api/schemas/waiver_templates.py`
- `api/services/waiver_template_lifecycle.py`
- `api/routers/admin_waiver_templates.py`
- `alembic/versions/x2d4b8c9f1a3_add_waiver_templates_table.py`
- `admin-app/src/api/waiverTemplates.js`
- `admin-app/src/pages/WaiverTemplates.jsx`
- `admin-app/src/App.jsx`
- `admin-app/src/pages/Dashboard.jsx`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 14, Phase 3 Feature 2 PDF Preservation Provenance) — 09c6433

Status: Committed

Scope guardrails:
- PDF preservation and provenance only.
- No participant UX changes.
- No email/SMS delivery changes.
- No analytics/timeline/bulk export scope.

Behavior summary:
- Extended immutable waiver PDF artifacts with template provenance fields:
  - `waiver_template_id`
  - `template_version`
  - `template_content_sha256`
- Captured template provenance snapshot at signing completion for future archive defensibility.
- Updated PDF artifact generation to bind each artifact to template provenance and use immutable unique storage paths.
- Added deterministic artifact verification endpoint output covering independent checks:
  - `integrity_status`
  - `provenance_status`
  - `storage_status`
  - final `artifact_status`
- Preserved non-overwrite behavior: generation returns existing artifact per waiver revision when present.

File touchpoints:
- `api/models/waiver_pdf_artifacts.py`
- `api/services/waiver_template_provenance.py`
- `api/services/waiver_signing.py`
- `api/services/waiver_pdf_archive.py`
- `api/schemas/waivers.py`
- `api/routers/waivers.py`
- `alembic/versions/y7c1e5d9a2b4_add_template_provenance_to_pdf_artifacts.py`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 14, Phase 3 Feature 3 Participant Activity Timeline) — 66d71fc

Status: Committed

Scope guardrails:
- Read-only timeline aggregation only.
- No participant workflow mutations.
- No analytics/reporting/dashboard scope.
- No manual timeline editing or persistence layer additions.

Behavior summary:
- Added canonical participant timeline event schema with stable enum-backed event types.
- Added deterministic ordering support with `sort_key` for secondary ordering when timestamps collide.
- Added read-only timeline aggregation service that projects events from existing domains:
  - participant registration
  - waiver template assignment context
  - waiver signed
  - PDF artifact generated
  - PDF verified
  - check-in completed
- Added admin read-only timeline endpoint per participant.
- Emitted `PDF_VERIFIED` into existing waiver audit stream to support canonical projection without introducing a new system of record.

File touchpoints:
- `api/schemas/participant_timeline.py`
- `api/services/participant_timeline.py`
- `api/routers/admin_participants.py`
- `api/routers/waivers.py`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 14, Phase 3 Feature 4 Volunteer Dashboard Operational Projection) — 07e17d6

Status: Committed

Scope guardrails:
- Read-only operational dashboard only.
- No persisted volunteer status fields.
- No analytics, trends, charts, or KPI scope.
- No editing from dashboard surface.

Behavior summary:
- Added volunteer dashboard projection schema with stable computed status enum:
  - `ACTION_REQUIRED`
  - `INCOMPLETE`
  - `CHECKED_IN`
  - `READY`
- Added read-only volunteer dashboard projection service computed from canonical participant/event/session/waiver data.
- Locked deterministic status precedence in projection logic:
  - `ACTION_REQUIRED`
  - `INCOMPLETE`
  - `CHECKED_IN`
  - `READY`
- Added deterministic `sort_key` output for stable ordering and idempotent repeated reads.
- Added admin read-only API endpoint for volunteer dashboard projection.
- Added read-only admin UI page and dashboard navigation entry for operational volunteer monitoring.
- Compliance state is explicit and non-fabricated when canonical data is unavailable:
  - `Compliance: Not Tracked`

File touchpoints:
- `api/schemas/volunteer_dashboard.py`
- `api/services/volunteer_dashboard_projection.py`
- `api/routers/admin_participants.py`
- `admin-app/src/api/events.js`
- `admin-app/src/pages/VolunteerDashboard.jsx`
- `admin-app/src/App.jsx`
- `admin-app/src/pages/Dashboard.jsx`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 14, Phase 3 Feature 5 Executive Analytics Dashboard) — a8c25ed

Status: Committed

Scope guardrails:
- Read-only analytics projection only.
- No transactional writes or edits.
- No stored counters or materialized summary tables.
- No predictive analytics, forecasting, or scheduled reporting scope.

Behavior summary:
- Added executive analytics metric card schema with stable card contract:
  - `metric_key`
  - `value`
  - `calculated_at`
  - `data_source`
- Added read-only executive analytics projection service computed from canonical domain data.

## Session Delta (Pending Commit - June 14, Phase 4.2 Governance and Audit Infrastructure) — <pending_commit>

Status: Pending commit

Scope guardrails:
- Governance and audit infrastructure only.
- No permissions model redesign.
- No workflow automation implementation.
- No volunteer lifecycle feature scope.
- No communications platform scope.
- No event operations/dashboard expansion beyond audit retrieval.

Behavior summary:
- Added canonical administrative audit model (`admin_audit_events`) for cross-domain governance event capture.
- Added dedicated audit service interface for immutable write-through and filtered read access.
- Added admin-authorized audit query endpoint with pagination and filters (`/api/admin/audit/events`).
- Integrated admin user-role update actions as first producer so permission changes append audit events in the same transaction.
- Preserved existing authentication and role-management behavior while adding governance traceability.

File touchpoints:
- `api/models/admin_audit_events.py`
- `api/models/__init__.py`
- `api/services/admin_audit.py`
- `api/schemas/admin_audit.py`
- `api/routers/admin_audit.py`
- `api/routers/auth.py`
- `api/main.py`
- `alembic/versions/z1f4c7a9b2d6_add_admin_audit_events.py`
- `docs/ARCHITECTURE_DECISIONS.md`
- `PROJECT_SYNC_BRIEF.md`
- Added dedicated admin analytics endpoint for executive dashboard payload.
- Reused existing projection/reporting layers where appropriate:
  - waiver reporting metrics
  - volunteer operational projection metrics
- Added read-only admin executive dashboard UI with metric cards and source metadata.
- Added cross-source consistency validation path for overlapping volunteer metrics.
- Compliance-related executive metric explicitly reports `Not Tracked` when canonical data is unavailable.

File touchpoints:
- `api/schemas/executive_analytics.py`
- `api/services/executive_analytics_projection.py`
- `api/routers/admin_analytics.py`
- `api/main.py`
- `admin-app/src/api/events.js`
- `admin-app/src/pages/ExecutiveDashboard.jsx`
- `admin-app/src/App.jsx`
- `admin-app/src/pages/Dashboard.jsx`
- `PROJECT_SYNC_BRIEF.md`

## Session Delta (Committed - June 7, URL Normalization Refactor) — b22d05e

Status: Committed

Commit chain:
- `b22d05e` refactor: centralize external URL normalization

Behavior summary:
- Added shared `normalizeExternalUrl(...)` helper in `admin-app/src/utils/externalUrl.js`.
- Replaced duplicated per-page URL normalization helpers in Event pages with a single shared import.
- Added fbcdn wrapper + signed URL expiry handling in one place to avoid stale/expired featured image links.

File touchpoints:
- `admin-app/src/utils/externalUrl.js`
- `admin-app/src/pages/Dashboard.jsx`
- `admin-app/src/pages/Events.jsx`
- `admin-app/src/pages/EventDetail.jsx`

Validation evidence:
- `get_errors` clean for all touched source files.
- `npm run build` succeeded in `admin-app`.

---

## Session Delta (Committed - June 7, Public Registration + Intake Assignment Flow) — aa25404

Status: Committed

Commit chain:
- `aa25404` feat: add public participant registration and intake assignment actions

Behavior summary:
- Added static public registration page for GitHub Pages at `admin-app/public/participant-registration.html`.
  - Loads event by slug via `GET /api/events/{slug}`.
  - Submits registration via `POST /api/public/events/{slug}/register`.
  - Handles 404/409/error states with user-friendly feedback.
- Added Event Detail intake visibility panel showing unassigned intake and waitlisted counts.
- Added one-click "Assign Top Recommendation" action for unassigned non-volunteer participants.
  - Uses existing recommendation engine (`fetchRecommendedSessions`) and existing assignment flow (`queueAssignment`).
- Preserved existing bulk auto-assign behavior for unassigned participants.

File touchpoints:
- `admin-app/public/participant-registration.html`
- `admin-app/src/pages/EventDetail.jsx`

Validation evidence:
- `get_errors` clean for touched files.
- `npm run build` succeeded in `admin-app`.

---

## Session Delta (Committed - June 7, RC1 Offline Validation Auth Continuity Fix) — <pending_commit>

Status: Pending commit

Defect classification:
- RC1 Blocker
- Area: Offline validation / operator session continuity
- Symptom: During offline check-in actions, the app redirected to `/login`, interrupting operator workflow.

Root cause:
- `fetchMyProfile(...).catch(...)` in `admin-app/src/App.jsx` cleared auth session for any profile fetch error, including offline/network failures.

Fix summary (minimal scope):
- Updated profile refresh error handling to preserve auth session on offline/network fetch failures.
- Continued to clear auth session for non-network failures.

File touchpoints:
- `admin-app/src/App.jsx`

Validation evidence:
- Reproduced pre-fix failure: offline check-in requests caused redirect to `/login`.
- Post-fix behavior: offline check-in flow remained in-app, showed offline queue status, and preserved operator session.
- Reconnection behavior confirmed: pending queue synced on reconnect; rejected updates surfaced as failed sync with retry/dismiss controls.

Notes:
- Docs build artifacts were intentionally left uncommitted during RC1 validation phases unless release publication is explicitly requested.

## 🔒 Backend Deployment & Auth – Locked Decisions

### Deployment (Render)
The application is executed from the project root using `uvicorn api.main:app`.
This means the Python import root is the repository root, and all imports must resolve from the `api` package.

* Start command: `uvicorn api.main:app`
* Build command: `pip install -r api/requirements.txt`
* API is deployed and accessible via `/docs`

### Import Architecture (DO NOT CHANGE)
This is a locked architectural decision. Changing import structure or start command will break deployment.

* All imports must use `api.*`
* Example:

  * ✅ `from api.db.session import SessionLocal`
  * ❌ `from db.session import SessionLocal`
* This is required for Render deployment consistency

### Authentication Status
Swagger uses OAuth2PasswordRequestForm: "username" field must be the user's email.

* Register endpoint working
* Login endpoint working
* JWT token generation working
* Swagger authorization confirmed working

### Critical Dependency Fix
All core dependencies should be version-pinned to prevent unexpected breaking changes during deployment.

* `bcrypt==3.2.2` is REQUIRED
* Newer versions break passlib with:
  `AttributeError: module 'bcrypt' has no attribute '__about__'`
* Do NOT upgrade bcrypt without testing

### Environment Constraints

* Running on Render free tier
* No shell access available
* Database persistence is not guaranteed long-term

### Data Initialization

* No automatic seeding in production
* Admin users should be created via `/register`

## Session Delta (Committed - May 1, Event Creation Button Tips + St Lucie Image) — 7f93864

Status: Committed

Commit chain:
- `7f93864` feat: add event creation tips and include stLucie event image

Behavior summary:
- **Templates button guidance**: Added tooltip text where Templates is surfaced so users understand template creation carries over details and those details remain editable after creation.
- **New Event button guidance**: Added tooltip text to clarify this path creates a single event without pre-filled template details.
- **Static image added**: Added `docs/images/stLucie_County_pepperPark_beach_view.jpg` to the published docs image set.

File touchpoints:
- `admin-app/src/pages/Events.jsx`
- `admin-app/src/pages/EventDetail.jsx`
- `docs/images/stLucie_County_pepperPark_beach_view.jpg`

Validation evidence:
- `get_errors` clean in modified React files (`Events.jsx`, `EventDetail.jsx`).

---

## Session Delta (Committed - May 1, User Management + Promote UI + Form Fixes) — ec98be8

Status: Committed

Commit chain:
- `46350b1` fix: move feedback form and images to public/ so builds don't overwrite them
- `04f5b89` docs: expand feedback form scope to include template and annual generation testing
- `449bdb5` feat: add admin user listing and promote-by-email endpoints
- `8c79ddb` fix: make promote-by-email robust to plus-sign query encoding
- `65ad679` feat: add body-based admin promote-by-email endpoint
- `ec98be8` feat: add in-app admin promote-user action

Behavior summary:
- **Static asset source fix**: All files served on GitHub Pages (feedback form, event images) must live in `admin-app/public/`, not `docs/` directly. `emptyOutDir: true` wipes `docs/` on every build. Images moved to `admin-app/public/images/`.
- **Feedback form scope updated**: Tasks now cover direct event creation, template-based event creation, annual generation, and verifying map/weather/surf links carry into generated events.
- **Admin user listing**: `GET /api/auth/admin/users` lists registered login users with optional `?email_contains=` and `?role=` filters.
- **Promote-by-email endpoints**: `PUT /api/auth/admin/users/by-email/role` (query params) and `PUT /api/auth/admin/users/by-email/role-body` (JSON body — preferred; avoids URL encoding issues with + in emails).
- **In-app Promote User button**: Admin-only button in app header. Click prompts for email, sends to body endpoint, shows success/failure alert. No Swagger needed.

Architecture note (DO NOT REGRESS):
- Registered login users live in `users` table, NOT the `participants` table. They will never appear in participant lists unless separately added as participants.
- `admin-app/public/` is the authoritative source for all static files served via GitHub Pages. Never edit `docs/` directly for static HTML or images.

Validation evidence:
- `get_errors` clean on all modified files.
- `npm run build` succeeded in `admin-app`.
- Tester accounts successfully promoted via in-app Promote User action.

---

## Session Delta (Committed - May 1, Feedback Form Polish + Hardening) — 8e57037

Status: Committed

Commit chain:
- `084b6a7` feat: improve feedback form autosave status indicator
- `8e57037` feat: harden feedback form with draft versioning, cross-tab sync, and exit save

Behavior summary:
- **Autosave indicator anti-flicker**: `Saving...` is delayed 180ms before appearing; short saves never flash the indicator.
- **"Saved • just now" hold**: indicator stays at "just now" for 10 full seconds before switching to relative time ("Xs ago" / "Xm ago"); 5-second polling interval.
- **Draft versioning**: localStorage draft stored as `{ version: 1, data: {...fields} }`; restore skips non-v1 drafts to avoid field-mapping errors after form schema changes.
- **Cross-tab draft sync**: `window.storage` event listener syncs draft changes across open tabs; silently skips focused fields to avoid interrupting active typing.
- **`Save & Exit` hardening**: clears pending debounce timer, performs a synchronous immediate save, then navigates to stored referrer (falls back to `/sfa-admin-testing/`).
- **Return path tracking**: `document.referrer` saved to `localStorage["sfa_feedback_return_path"]` on load so post-submit and Save & Exit can both route back to the app.
- All localStorage operations wrapped in try/catch; gracefully disabled if storage is unavailable.

Key localStorage keys (DO NOT RENAME without updating restore logic):
- `sfa_feedback_draft` — versioned draft object `{ version: 1, data: {...} }`
- `sfa_feedback_return_path` — referrer URL captured on page open

Validation evidence:
- `get_errors` on `docs/event-creation-feedback-form.html` returned clean at each stage.
- Committed and pushed to `origin/master`.

---

## Session Delta (Committed - May 1, GitHub Pages + Tester Feedback Flow) — a38fa34

Status: Committed

Commit chain:
- `082a35e` fix: use production API base for github pages login
- `4b6469f` fix: point github pages frontend to live api host
- `58c12eb` fix: add SPA 404 redirect and .nojekyll for github pages routing
- `c6b5a4b` fix: correct SPA redirect to encode full path including basename
- `6aa2128` fix: use BASE_URL for public assets and fix manifest icon paths
- `cbcc99d` fix: move 404.html and .nojekyll to public folder, add SPA redirect to index.html source
- `7cf926b` chore: add event images for github pages
- `a38fa34` Add feedback button

Behavior summary:
- GitHub Pages SPA deep-link routing now works (including `/login`) using 404 redirect + startup path restoration.
- Frontend production API base points at Render host; login fetches no longer target localhost in production.
- Public asset pathing was corrected for GitHub Pages base path handling.
- Event images are now hosted in `docs/images/` and available via public URL pattern:
  - `https://ksprinkle.github.io/sfa-admin-testing/images/<filename>.jpg`
- Featured image resolution issue was confirmed to be URL path usage (`/images/...` is valid; `/docs/images/...` is not).
- Added global header Feedback button in admin shell that opens tester form:
  - `./event-creation-feedback-form.html`

Important operational note:
- CORS for production must include GitHub Pages origin in Render env vars:
  - `CORS_ORIGINS=https://ksprinkle.github.io`

Validation evidence:
- Verified public image URL behavior:
  - `/images/...` returns HTTP 200
  - `/docs/images/...` returns HTTP 404
- Latest commit pushed to `origin/master` and deployment initiated from GitHub Pages.

## Session Delta (Committed - April 30, UI Theme System + Runtime Fix) — 184f58c

### Frontend: Global UI Theme System
Status: Committed (0b7e801)
Files changed:
- admin-app/src/index.css
- admin-app/src/components/Card.jsx
- admin-app/src/components/Button.jsx
- admin-app/src/components/AppLayout.jsx
- admin-app/src/components/ParticipantForm.jsx
- admin-app/src/components/EventForm.jsx
- admin-app/src/components/TopBar.jsx
- admin-app/src/components/Drawer.jsx
- admin-app/src/pages/EventDetail.jsx
- admin-app/src/pages/FastAssign.jsx
- admin-app/src/pages/Events.jsx
- admin-app/src/pages/Dashboard.jsx
- admin-app/src/pages/CheckIn.jsx
- admin-app/src/pages/EventTemplates.jsx

Behavior summary:
- Added CSS variable theme tokens to `index.css`: `--color-primary`, `--bg-card`, `--text-secondary`, `--radius-lg`, `--shadow-sm`.
- Added global typography scale for h1/h2/h3/body/small/label elements.
- Added `card-in` fade-in keyframe animation and `card-animate` class with `prefers-reduced-motion` safeguard.
- Introduced reusable `Card` and `Button` components using theme tokens.
- Standardized all helper text, labels, metadata, and subtitles across all major pages and components to use `.text-secondary` utility class (replaces inline `text-gray-*`/`text-muted` variants).

Validation evidence:
- Frontend diagnostics: pass (no errors on all modified files)
- Frontend build: pass (`npm run build` in `admin-app`)

### Deployment: Python Runtime Pin
Status: Committed (7558e60 → 184f58c)
Files changed:
- runtime.txt (created at `api/`, moved to repo root)

Behavior summary:
- Added `runtime.txt` with `python-3.11.9` for Render deployment Python version pinning.
- File was initially created in `api/`, then moved to repo root for correct Render resolution.
- Git also recorded `api/requirements.txt` as renamed to root `requirements.txt`.

Validation evidence:
- File present and verified at repo root.
- Committed and pushed to `origin/master`.

---

## Session Delta (Committed - April 30, Deployment and Environment Stability) — 3c11a91

Status: Committed

Commit chain:
- `64b9e9f` fix render start command
- `88de896` fix render.yaml static -> web
- `d730a88` fix render.yaml structure and rootDir
- `6f2f8bd` fix import consistency (api package)
- `eaad62f` fix bcrypt compatibility with passlib
- `3c11a91` lock dependency versions for stability

Behavior summary:
- Render deployment configuration is now aligned for the backend service shape and root directory.
- Backend startup command and import strategy now consistently use package execution (`api.*`).
- Dependency/runtime stability improved by bcrypt-passlib compatibility alignment and tighter version locking.
- Temporary seed-state experiments were backed out to restore expected working behavior.

Validation evidence:
- Multiple commit/push cycles completed successfully to `origin/master`.
- Working tree returned clean after each stabilization pass.

---

## Session Delta (Committed - April 28, Public Event Registration Endpoint) — 6010cc4

### Backend: Public Self-Registration Route
Status: Committed (6010cc4)
Files changed:
- api/routers/events.py
- api/schemas/participants.py
- api/main.py

Behavior summary:
- Added `POST /api/public/events/{slug}/register` on a new `public_router`.
- Resolves event by slug; returns 404 if not found.
- Reuses existing `create_participant(...)` CRUD — no duplicate logic.
- `is_waitlisted` defaults False; `session_id` defaults null (unassigned).
- Duplicate email+event returns 409 via existing CRUD conflict behavior.
- Added `PublicEventRegister` Pydantic schema (supports participant + optional volunteer fields).
- Registered `public_events_router` in `api/main.py`.

Validation evidence:
- Backend diagnostics: pass (`get_errors` on touched backend files)

---

## Session Delta (Committed - April 28, EventDetail Staffing UX Polish) — 0d269bc

### Frontend: Session Staffing Indicators, Preview Chips, Suggested Moves, Summary Panel
Status: Committed (0d269bc)
Files changed:
- admin-app/src/pages/EventDetail.jsx

Behavior summary:

Preview chip clarity + consistency:
- Chip format: "Moving Water: John D. (Versatile), Sarah K. +1" with bold label span + name span.
- Muted chip style: `border-gray-200 bg-gray-50 text-gray-700 rounded-full`.
- Truncation preserved: max 2 names + "+N" overflow.

Reason tooltip/inline split (cross-browser):
- `buildPreviewReasonText` returns `{ tooltip, inline }`.
- `tooltip`: single-line "Selected because: • reason1 • reason2" (safe for native `title`).
- `inline`: multi-line `\n`-separated bullets rendered with `whitespace-pre-line`.

Heat indicator micro-polish:
- Badge count clamped: `assistanceCount > 5 ? "5+" : assistanceCount`.
- Labels: "High Assistance (3)", "Moderate (2)", "Low" (no count at low).

Auto-suggest action (new):
- `waterSuggestedCount = min(shortage, candidates, 3)` per role.
- `canSuggestWater/Beach` guards: shortfall > 0, candidates > 0, not in-flight.
- "★ Move N Water/Beach Volunteer(s)" buttons above manual buttons; calls `handleGuidedVolunteerMoveBatch`.
- "Why N?" muted hint line below buttons: "Based on shortage (N) and available volunteers (N)".
- `disabled` + `opacity-60` when `canSuggest*` is false.
- "✓ All set — staffing looks good" shown when `sessionIsBalanced`.

Top-of-page summary panel (new):
- IIFE block; no new state; derives from `groupedParticipants` + existing helpers.
- Excludes UNASSIGNED bucket defensively (`!sessionId || sessionId === "UNASSIGNED"`).
- Chip order: ⚠️ needs attention → 🔴 high → 🟡 moderate → 📊 total → ✓ all good.
- Attention chip has `animate-pulse border border-amber-300` when count > 0.
- "✓ All sessions staffed" shown only when totalSessions > 0 and attention === 0.

Validation evidence:
- Frontend diagnostics: pass (`get_errors` on EventDetail.jsx — clean at each stage)

---

## Session Delta (Uncommitted - April 28, Admin Participant Registration Hardening + Offline Create UI)

### Backend: Admin Participant Create Route Normalization
Status: Implemented in working tree (not yet committed)
Files changed:
- api/routers/admin_participants.py
- api/crud/participants.py
- api/schemas/participants.py
- api/routers/admin_events.py

Behavior summary:
- Refactored `POST /api/admin/participants/` to reuse shared participant CRUD creation path.
- Removed implicit admin auto-session assignment/session auto-creation behavior from create route.
- Create route now supports optional explicit `session_id`; if omitted, participant remains unassigned.
- Response model aligned to admin list shape (`AdminParticipantListOut`) for richer admin payloads.
- Added `notes` to admin participant list schema and mapped into admin participant list/create response payloads.
- Duplicate participant registration handling aligned with public behavior:
  - duplicate event+email now returns HTTP 409 with stable conflict detail.
- Added shared CRUD safety fix to exclude duplicate `event_id` kwargs when constructing ORM model.

Validation evidence:
- Backend diagnostics: pass (`get_errors` on touched backend files)
- Runtime smoke checks: pass
  - duplicate create returns 409
  - create with explicit session id succeeds
  - existing move-session endpoint still succeeds for created participant

### Frontend: Offline-Queue-Based Admin Participant Create UI
Status: Implemented in working tree (not yet committed)
Files changed:
- admin-app/src/components/ParticipantForm.jsx
- admin-app/src/api/events.js
- admin-app/src/pages/Participants.jsx
- admin-app/src/pages/EventDetail.jsx

Behavior summary:
- Added reusable `ParticipantForm` modal component with existing backend fields only:
  - first_name, last_name, email, role, is_minor, priority, notes, session_id
- Added Add Participant entry points on:
  - Participants page
  - Event Detail page
- Implemented create flow through existing offline queue patterns (no direct submit bypass):
  - optimistic local insert immediately on submit
  - enqueue `create_participant` action
  - process queued create actions through existing queue processors
  - non-blocking submit and modal close on submit
- Session dropdown populates from event sessions and shows occupancy label (`Session N (x/y)`) when available.
- Added lightweight UX polish: remembers last selected `session_id` per event in local storage for repeated sibling entry.

Validation evidence:
- Frontend diagnostics: pass (`get_errors` on ParticipantForm.jsx, events.js, Participants.jsx, EventDetail.jsx)
- Frontend build: pass (`npm run build` in `admin-app`)

## Session Delta (Uncommitted - April 28, Participant Edit Flow + Assistance Visibility + Volunteer Form Hardening)

### Backend: Assistance Flag + Admin Payload Coverage + Migration Alignment
Status: Implemented in working tree (not yet committed)
Files changed:
- api/models/participants.py
- api/schemas/participants.py
- api/routers/admin_participants.py
- api/routers/admin_events.py
- alembic/versions/m1a2b3c4d5e6_add_requires_assistance_to_participants.py
- alembic/versions/808eb7aca1b1_merge_heads.py

Behavior summary:
- Added persistent `requires_assistance` support on participants with schema/model coverage.
- Extended admin participant list and update payloads to include `requires_assistance` and `notes` consistently.
- Preserved volunteer normalization behavior so non-volunteers can carry the assistance flag while volunteers force it false.
- Added guarded Alembic migration for `requires_assistance` and merged multiple heads into a single linear upgrade path.

Validation evidence:
- Backend diagnostics: pass (`get_errors` on touched backend files)
- Runtime verification: pass
  - resolved `participants.requires_assistance` schema drift
  - `GET /api/admin/participants` recovered to 200 after migration alignment

### Frontend: Edit Reuse + Event Context Standardization + Volunteer UX + Assistance Visibility
Status: Implemented in working tree (not yet committed)
Files changed:
- admin-app/src/components/ParticipantForm.jsx
- admin-app/src/components/ParticipantActionsDropdown.jsx
- admin-app/src/pages/Participants.jsx
- admin-app/src/pages/EventDetail.jsx

Behavior summary:
- Reused `ParticipantForm` for participant edit flows on both Participants and Event Detail.
- Added edit entry points on participant row actions and event-detail participant cards.
- Routed edit submissions through the existing offline queue/update pattern using `edit_participant` actions.
- Standardized `ParticipantForm` integration to always pass `eventId` and normalized nullable `eventType` (`chapter`, `tour`, or `null`).
- Added deterministic volunteer primary type selection when multiple volunteer types are selected:
  - priority order `water`, `beach`, `food`, `raffle`
- Added helper copy in the volunteer form to clarify which selected volunteer types are driving additional role options.
- Added compact `Needs Assistance` badges to Participants rows and Event Detail cards.
- Added a simple Participants-page-only `Show Assistance Needed` filter toggle.

Validation evidence:
- Frontend diagnostics: pass (`get_errors` on ParticipantForm.jsx, ParticipantActionsDropdown.jsx, Participants.jsx, EventDetail.jsx)
- Frontend build: pass (`npm run build` in `admin-app``; chunk-size warning only)

## Session Delta (Committed - April 28, Intake-Aware Session Assignment)

### Status
- Recommendation engine implemented (scoring + balancing)
- Endpoint returning ranked session suggestions
- ParticipantForm displays explainable recommendations
- Bulk auto-assign uses recommendation engine via offline queue

### Behavior
- Balances:
  - Capacity
  - Assistance needs
  - Minor/adult distribution
- No automatic assignment during creation
- All assignments remain user-initiated

### Notes
- Recommendation engine is stateless and side-effect free
- Bulk assignment runs sequentially to avoid race conditions

### Working Changes
- backend/app/services/session_recommender.py (implemented logic)
- api/routers/admin_participants.py (endpoint)
- admin-app/src/components/ParticipantForm.jsx (UI)
- admin-app/src/pages/EventDetail.jsx (bulk tool)
- admin-app/src/api/events.js (API client)

### Validation evidence
- Backend diagnostics: pass (`get_errors` on session_recommender.py and admin_participants.py)
- Frontend diagnostics: pass (`get_errors` on ParticipantForm.jsx, EventDetail.jsx, and events.js)
- Runtime verification: pass
  - full sessions are excluded from recommendations
  - ranked recommendations return non-identical scores when capacity exists
  - recommendation reasons are present in returned payloads
  - different participants can produce different top recommendations

## Session Delta (Committed - April 28, Check-In Routing UX)

### Check-In Tab Event-Selection Guidance
Status: Committed
Files changed:
- admin-app/src/components/BottomNav.jsx
- admin-app/src/pages/Events.jsx

Behavior summary:
- Clarified Check-In tab behavior when no explicit event is selected:
  - If currently on an event route, tab opens that event's check-in and remembers the event id.
  - If exactly one published event exists, tab opens that event's check-in and remembers it.
  - If multiple published events exist, tab prefers the remembered published event.
  - If no valid single target can be resolved, tab routes to Events with `checkin_select=1` guidance state.
- Added Events page guidance banner when `checkin_select=1` is present:
  - "Select an event first, then open Check-In from that event."
- No backend/API changes and no check-in business logic changes.

Validation evidence:
- Frontend diagnostics: pass (`get_errors` on BottomNav.jsx and Events.jsx)
- Frontend build: pass (`npm run build` in `admin-app`)

## Session Delta (Committed - April 28)

### Offline Queue Row-Level Sync UX
Status: Committed
Files changed:
- admin-app/src/pages/Participants.jsx
- admin-app/src/pages/EventDetail.jsx

Behavior summary:
- Preserved existing offline queue logic, retry flow, optimistic updates, and backend/API behavior.
- Added per-row/per-card sync state visibility for queued participant actions:
  - `Syncing...` for pending items
  - `Failed` for failed items
  - inline `Retry` action for retryable failures
  - lightweight inline error detail text when a queued action fails
- Added global queue action for failed items:
  - `Retry All Failed (n)` button in queue banners on Participants and Event Detail
  - implemented via lightweight helper that reuses existing per-item retry path
- Added consistent icon-based sync state rendering for row/card status:
  - pending uses `⏳`
  - failed uses `●`
  - synced support included in shared helper
- Added safe queue item metadata aliases for UI display only:
  - `status`
  - `error`
  - `lastAttemptAt`
  - stable local `id` for row-level retry targeting
- Enhanced offline queue summary banner wording to show `pending · failed` counts.
- Conflict/server rejection handling remains non-blocking:
  - optimistic UI state is preserved
  - failed rows are marked visually
  - user can retry or manually correct state in the UI

Validation evidence:
- Frontend diagnostics: pass (`get_errors` on Participants.jsx and EventDetail.jsx)
- Frontend build: pass (`npm run build` in `admin-app`)

## Session Delta (Uncommitted - April 27)

### Event Lifecycle Audit + Removed Events History
Status: Implemented in working tree (not yet committed)
Files changed:
- api/models/event_activity_log.py
- api/models/__init__.py
- alembic/versions/k9d2a5f7c1e4_add_event_activity_log_table.py
- api/crud/events.py
- api/schemas/events.py
- api/routers/admin_events.py
- admin-app/src/api/events.js
- admin-app/src/pages/Events.jsx

Behavior summary:
- Added new persistent `event_activity_logs` audit table for event lifecycle actions.
- Added automatic audit logging for system-driven auto-archive transitions:
  - action_type: `auto_archived`
  - reason_code: `passed_event_date`
- Added explicit admin cancel endpoint with reason capture:
  - `POST /api/admin/events/{event_id}/cancel`
  - payload: `{ reason_code, reason_note }`
  - logs action_type `cancelled`.
- Updated event delete endpoint to log before delete:
  - `DELETE /api/admin/events/{event_id}` now accepts optional body `{ reason_code, reason_note }`
  - logs action_type `deleted`.
- Added removed-events history APIs:
  - `GET /api/admin/events/history/removal-log`
  - `GET /api/admin/events/history/removal-log/export.csv`
  - filterable by `action_type`, `reason_code`, `event_type`, `actor_email`, `title_search`, `date_from`, `date_to`.
- Added Events page "Removed Events History" section at bottom (Participants-style window):
  - filter controls + quick action chips
  - paginated table
  - CSV export
  - refresh control
- Events UI cancel/delete flows now prompt for reason metadata and send to backend for audit logging.
- Event Templates delete action now requires typed confirmation before delete proceeds:
  - accepts `delete` (any case), or
  - accepts a one-time 4-digit code shown in the confirmation prompt.

Validation evidence:
- Frontend build: pass (`npm run build` in `admin-app`)
- Backend syntax compile: pass (`python -m compileall api`)

## Companion Documents

- Planning intent template: ROADMAP_INTENT.md
- Use this file for implementation truth and commit-backed status.

## 0) Auto-Update Block (Copilot Maintained)

Use this block at the end of every coding session.

### Last Session Snapshot
- Session date:
- Latest commit hash:
- Files changed:
- Build check: Pass/Fail
- Runtime smoke check: Pass/Fail
- New risks introduced: Yes/No

### End-of-Session Checklist
- [ ] Update Date and Latest implementation commit near top of file.
- [ ] Add newly completed TASK entries (with commit hash evidence).
- [ ] Move any active item between In Progress and Completed Work.
- [ ] Re-prioritize Pending / Next Backlog Candidates.
- [ ] Update API / Data Contract Notes if request/response behavior changed.
- [ ] Update Frontend Behavior Notes if user-visible behavior changed.
- [ ] Update Validation Evidence with build/test results from this session.
- [ ] Update Known Constraints / Gaps when blockers or assumptions change.
- [ ] Add one-line "Next Session Starter" note at the bottom.

### Next Session Starter
- Start with:

## 1) How To Use This Brief With ChatGPT

Copy this file into ChatGPT at the start of planning sessions.

Prompt pattern to use with ChatGPT:
- "Use this as the source of truth for current implementation state."
- "Do not mark anything implemented unless listed in Completed Work with commit hash evidence."
- "Return recommendations as numbered backlog items with acceptance criteria."

Operating rule:
- All coding changes happen through Copilot in this repo.
- ChatGPT is planning/advisory only.

## 2) Current Product State

- Admin PWA is actively used on laptop/phone for event operations.
- Build/version fingerprint is visible in app UI.
- Service worker behavior was adjusted to reduce stale bundles.
- Event Type chip/pill wrapping on mobile is fixed.
- Offline-first behavior now exists across key participant mutation flows.

## 3) Completed Work (Recent)

### TASK-001: Build parity visibility and stale-cache reduction
Status: Done
Commits: be77f16
Outcome:
- Added build fingerprint badge.
- Injected VITE_APP_VERSION and VITE_BUILD_ID via Vite config.
- Updated service worker strategy and cache versioning.

### TASK-002: Event Type mobile wrapping fix
Status: Done
Commits: be77f16
Outcome:
- Hardened no-wrap behavior for filter chips and Event Type badge cells.

### TASK-003: Remove dev diagnostics from Check-In
Status: Done
Commits: be77f16
Outcome:
- Removed temporary debugging controls/panel.
- Retained realtime websocket + polling fallback + queue behavior.

### TASK-004: Offline-first check-in local resilience
Status: Done
Commits: 3bd41d7
Outcome:
- Check-In restores cached roster data while offline.
- Optimistic local check-in state persists and queues sync.

### TASK-005: Participants page offline-first mutations
Status: Done
Commits: 3bd41d7
Outcome:
- Local optimistic updates + queued sync for:
  - check-in
  - waiver verify
  - promote
  - remove
  - priority updates
  - participant/volunteer type and role updates
- Added offline queue status banner.

### TASK-006: Event Detail offline-first mutations
Status: Done
Commits: 3bd41d7
Outcome:
- Local optimistic updates + queued sync for:
  - drag/drop session moves
  - priority updates
- Added offline queue status banner.

### TASK-007: Duplicate Event admin tool
Status: Done
Commit hash: 7dcef27
Files changed:
- api/routers/admin_events.py
- admin-app/src/api/events.js
- admin-app/src/pages/EventDetail.jsx
Behavior summary:
- Added admin endpoint `POST /api/admin/events/{event_id}/duplicate` that duplicates event configuration and creates a new draft event.
- Reused existing event creation + session auto-generation logic (no direct session row copy).
- Confirmed duplicated events do not copy participants/waitlist/check-in state and navigate to the new event from Event Detail.
- Added `Duplicate Event` button in Event Detail with confirm prompt, disabled/loading state, and graceful error display.

### TASK-008: EventTemplate foundation
Status: Done
Commit hash: a14746a
Files changed:
- api/models/__init__.py
- api/main.py
- api/models/event_templates.py
- api/schemas/event_templates.py
- api/routers/admin_event_templates.py
- alembic/versions/e6c1f4b2a9d8_add_event_templates.py
- admin-app/src/api/events.js
- admin-app/src/App.jsx
- admin-app/src/pages/Events.jsx
- admin-app/src/pages/EventTemplates.jsx
Behavior summary:
- Added persistent `EventTemplate` model and migration with minimal reusable fields for name/location/capacity/event type/default time and session planning metadata.
- Added admin template API endpoints:
  - `POST /api/admin/event-templates`
  - `GET /api/admin/event-templates`
  - `GET /api/admin/event-templates/{template_id}`
  - `PUT /api/admin/event-templates/{template_id}`
  - `DELETE /api/admin/event-templates/{template_id}`
  - `POST /api/admin/event-templates/{template_id}/create-event`
- Implemented create-from-template flow by mapping template values into existing `EventCreate` fields and reusing existing `crud.create_event` logic for session auto-creation; no existing event creation endpoint behavior was changed.
- Added new admin UI page `EventTemplates` for listing, creating, deleting templates, and creating draft events from templates by date.
- Added route `/event-templates` and a `Templates` action button on Events page for quick access.

### TASK-009: Deterministic schedule rule engine + annual generation
Status: Done
Commit hash: a56fc88
Files changed:
- api/utils/schedule_rules.py
- api/schemas/event_templates.py
- api/routers/admin_event_templates.py
- admin-app/src/api/events.js
- admin-app/src/pages/EventTemplates.jsx
Behavior summary:
- Added reusable schedule-rule utility for deterministic date generation:
  - rule fixed to 2nd and 3rd Saturday
  - month window fixed to May through September
- Added admin endpoint `POST /api/admin/event-templates/{template_id}/generate-annual-events` with body `{ "year": <int> }`.
- Endpoint maps rule dates into existing event creation flow (`crud.create_event`) and forces generated events to draft.
- Duplicate prevention is deterministic per template signature (title + event_type + venue + start_date):
  - matching event already exists -> date is skipped
  - no match -> event is created
- Added Event Templates UI controls to generate a season by year and surface `created_count`/`skipped_count` result.

### TASK-010: Schedule rule support + annual event generation (template-driven)
Status: Done
Commit hash: 2f9f45e
Files changed:
- api/models/event_templates.py
- api/models/events.py
- api/schemas/event_templates.py
- api/utils/schedule_rules.py
- api/routers/admin_event_templates.py
- alembic/versions/c4d21f09a6be_add_template_schedule_rule_fields.py
- admin-app/src/api/events.js
- admin-app/src/pages/EventTemplates.jsx
Behavior summary:
- Extended `EventTemplate` with reusable schedule rule fields:
  - `schedule_rule_type` (initial supported value: `nth_weekday`)
  - `schedule_months` (e.g., `[5,6,7,8,9]`)
  - `schedule_weekday` (`0=Mon ... 5=Sat`)
  - `schedule_week_numbers` (e.g., `[2,3]`)
- Added deterministic date utility functions using standard `calendar`/`datetime` only:
  - `get_nth_weekday(year, month, weekday, n)`
  - `generate_dates_from_template(template, year)`
- Added endpoint `POST /api/admin/event-templates/{template_id}/generate-annual` with request body `{ "year": 2027 }` and response:
  - `{ "created": X, "skipped": Y, "dates": [...] }`
- Annual generation reuses existing template-to-event creation path (`create-event-from-template` mapping logic), preserves draft status, and relies on existing event/session creation behavior.
- Duplicate protection on annual generation uses deterministic match:
  - same `start_date`
  - and (`template_id` match when present OR `title` match fallback)
- Added optional `template_id` on `Event` for cleaner duplicate detection/reference without changing public event contracts.
- Frontend `EventTemplates` now supports defining schedule rule fields on template creation and triggering annual generation by year with result summary.

### TASK-011: Preview-before-generate for annual events
Status: Done
Commit hash: 86f9918
Files changed:
- api/schemas/event_templates.py
- api/routers/admin_event_templates.py
- admin-app/src/api/events.js
- admin-app/src/pages/EventTemplates.jsx
Behavior summary:
- Enhanced existing `POST /api/admin/event-templates/{template_id}/generate-annual` endpoint with request field `preview`.
- `preview=true` now returns a preview payload without creating events:
  - `preview`
  - `year`
  - `dates[]` where each row includes `date` and `exists`.
- Preview and actual generation both reuse the same schedule-rule date generation and duplicate-detection helper logic.
- Non-preview generation flow remains unchanged in behavior (`created`/`skipped`/`dates` response), with no modifications to core event creation flow.
- Admin UI now supports flow:
  - Generate Annual Events -> preview by year
  - review list of New vs Already exists dates
  - Confirm & Generate to execute real generation
- UI includes mobile-friendly preview panel, clear status styling, and disabled confirm while processing.

### TASK-012: Save Event as Template
Status: Done
Commit hash: 429734e
Files changed:
- api/routers/admin_events.py
- admin-app/src/api/events.js
- admin-app/src/pages/EventDetail.jsx
Behavior summary:
- Added admin endpoint `POST /api/admin/events/{event_id}/save-as-template`.
- Endpoint fetches event + sessions and creates a new `EventTemplate` with mapped values:
  - `name <- event.title` (or optional `template_name` from request)
  - `location <- event.venue`
  - `capacity <- event.participant_capacity` (fallback to first session capacity, then 15)
  - `event_type <- event.event_type`
  - `default_start_time <- event.start_time` (fallback to first session start time, then 09:00)
  - `default_end_time <- event.end_time` (fallback to first session end time, then 12:00)
  - `session_count <- number of event sessions` (minimum 1)
  - `session_capacity <- first session capacity` (fallback 15)
- No participants, session assignments, waitlist, check-in, event dates, or event records are copied.
- Added Event Detail button `Save as Template` with:
  - confirmation prompt
  - optional template name prompt (prefilled from event title)
  - disabled state while saving
  - success and error messages.

### TASK-013: Save as Template with schedule rule input
Status: Done
Commit hash: f706c7b
Files changed:
- api/routers/admin_events.py
- admin-app/src/api/events.js
- admin-app/src/pages/EventDetail.jsx
Behavior summary:
- Enhanced existing endpoint `POST /api/admin/events/{event_id}/save-as-template` to accept optional schedule fields:
  - `schedule_rule_type`
  - `schedule_months`
  - `schedule_weekday`
  - `schedule_week_numbers`
- If schedule fields are omitted, endpoint applies default chapter schedule values:
  - `nth_weekday`, months `[5,6,7,8,9]`, weekday `5`, week numbers `[2,3]`
- Endpoint now reuses existing `EventTemplateCreate` schema validation when constructing template data.
- Replaced Event Detail prompt flow with a minimal modal:
  - template name input (prefilled)
  - default checked `Use Chapter Schedule` toggle
  - optional basic custom schedule inputs when unchecked (months CSV, weekday dropdown, weeks CSV)
  - confirm action posts template name + schedule fields
- Save button remains disabled while saving and shows success/error status.

## 4) In Progress

- SESSION-2026-04-27 (Pending Commit): Event template parity and calendar/date UX hardening
  - Save-event-as-template now maps full logistics/media/report-link fields into `EventTemplate`.
  - Create-event-from-template now maps those same fields into the new draft event.
  - Event template model/schema/form expanded for logistics/media/report-link editing.
  - Date picker/calendar UX stabilized for Tour templates (reference date highlighting, year/month behavior, deselect behavior, timezone-safe last-event label).
  - `EventTemplate` now persists the source event date in `event_templates.date` so Tour templates retain the event date from the template's creation source.
  - Save-event-as-template now writes `date=event.start_date` into the template record.
  - All three Tour template calendar surfaces must default to the same seed date: left Event Date card, right Show Date Calendar, and Preview/Generate Annual calendars.
  - Tour calendar fallback order is now: user-picked date, persisted `template.date`, legacy Tour historical match, then today.
  - Preview/generation year defaults to the seed date year instead of blindly using the current year.
  - Manual `map_url` support added across event/template models, schemas, API payloads, and admin forms.
  - Event Detail Map button now prefers manual `map_url`, with coordinate-search fallback retained.
  - Save-as-template now backfills NOAA weather links when coordinates exist but a manual weather URL is missing.

## 5) Pending / Next Backlog Candidates

- Add per-row "pending sync" indicators in Participants and Event Detail.
- Add queue conflict resolution UX for server-side rejects after reconnect.
- Add automated smoke script for offline queue scenarios.
- Add release publish workflow once git remote is configured.

## 6) API / Data Contract Notes

- Priority update endpoint uses query parameter (`priority`) not JSON body.
- Volunteer capacity currently informational, not enforced for participant seat limits.
- Real-time updates use websocket endpoint `/api/ws/updates`.
- Admin event and template payloads now support optional `map_url` alongside `weather_report_url` and `surf_report_url`.
- Event-template create/update and create-event-from-template flows preserve manual `map_url` values end to end.
- Event template payloads now also support optional persisted `date` for source-event seed date behavior.

## 7) Frontend Behavior Notes

- Primary admin app is under `admin-app`.
- In dev, API base resolves to current host (`window.location.hostname`) to support phone/laptop testing on LAN.
- Participants/Event Detail/Check-In now each include offline queue and sync retry behavior for supported actions.
- Event editing and Event Template editing now expose a `Map URL` input near the existing weather/surf/resource fields.
- Event Detail Map button uses manual `map_url` first, then generated Google Maps coordinate/location search as fallback.
- Tour template calendars should stay visually consistent across all entry points by seeding from the same saved template date when present.

## 8) Validation Evidence

- Frontend production build succeeded after latest changes.
- Backend health endpoints previously validated (`/`, `/openapi.json`).
- Manual phone validation confirmed offline-first behavior now works for tested flows.
- Schedule generation smoke test passed:
  - first run for 2026 created 10 events (2nd/3rd Saturdays across May-September)
  - second run for 2026 created 0 and skipped 10 (idempotent duplicate handling)
- Admin app build passed after UI generation controls were added.
- Added schedule-rule contract validation:
  - OpenAPI contains `/api/admin/event-templates/{template_id}/generate-annual`.
  - Annual generation run for 2027 returned deterministic date set and idempotent duplicate skipping on repeat.
  - Generated events verified as `draft` with sessions created via existing event creation logic.
- Preview-before-generate validation passed:
  - preview response returned full date list with `exists` flags
  - preview mode produced no event writes
  - confirm generate created expected events and repeat run skipped duplicates.
- Save-as-template validation passed:
  - template created from existing event with mapped fields
  - created template successfully used for create-event flow
  - resulting event was draft with sessions
  - temporary smoke data cleaned up.
- Save-as-template schedule-rule validation passed:
  - default schedule values persisted when schedule fields omitted
  - custom schedule values persisted when provided via request
  - temporary smoke templates cleaned up.
- April 27 implementation validation:
  - Static diagnostics for modified frontend/backend files report no errors.
  - Alembic migration path updated and upgraded to head locally.
  - Save-event-as-template mapping gap for logistics/report links identified and patched in backend route.
  - Directions field placement updated in template form per operator feedback.
  - Manual `map_url` smoke test passed for template create -> event create -> event update persistence.
  - Save-event-as-template smoke test passed with `map_url` copied into the created template.
  - Manual weather fallback smoke test passed: saving an event with coordinates and no weather URL produced a NOAA `MapClick` link.
  - `EventTemplateCreate` schema date validation bug fixed by aliasing the imported date type to avoid a Pydantic field/type name collision.
  - Direct schema validation check passed: `EventTemplateCreate(..., date=datetime.date(...))` now accepts a real date value.
  - Tour template calendar consistency patch applied so Show Date Calendar and Preview calendars use the same seed date as the main Event Date card.

## 11) Session Delta (2026-04-27, Pending Commit)

- Files touched in this session include:
  - `api/routers/admin_events.py`
  - `api/routers/admin_event_templates.py`
  - `api/utils/event_builder.py`
  - `api/models/events.py`
  - `api/models/event_templates.py`
  - `api/schemas/event_templates.py`
  - `api/schemas/events.py`
  - `admin-app/src/components/EventForm.jsx`
  - `admin-app/src/pages/EventTemplates.jsx`
  - `PROJECT_SYNC_BRIEF.md`
  - `alembic/versions/g7e2d4f8b9c3a_add_map_url_field.py`
  - `alembic/versions/h2c4e6f8a1b0_add_date_to_event_templates.py`
  - `alembic/versions/f5e3d9c1a6b2_add_logistics_to_event_templates.py`
  - `alembic/versions/a7b1e8b14ffd_merge_heads.py`
- Pending commit note:
  - Promote this session from In Progress to Completed Work after commit hash is available.

### TASK-014: Edit EventTemplate
Status: Done
Commit hash: 5ce8bcf
Files changed:
- admin-app/src/api/events.js
- admin-app/src/pages/EventTemplates.jsx
Behavior summary:
- Reused existing backend endpoint `PUT /api/admin/event-templates/{template_id}` for template edits; no backend route redesign was required.
- Added frontend API helper `updateEventTemplate(templateId, data)`.
- Reused existing Create Template form as dual create/edit form (no separate form component):
  - Template card now includes `Edit` button.
  - Clicking `Edit` loads selected template values (including schedule fields) into the left form.
  - Form switches to edit mode and submit label changes to `Update Template`.
  - Added `Cancel Edit` to exit edit mode and reset form state.
- Editable fields in edit mode include:
  - base template fields (name, location, capacity, event_type, start/end time)
  - session config (session_count, session_capacity)
  - schedule fields (schedule_rule_type, schedule_months, schedule_weekday, schedule_week_numbers)
- On successful update, template list is updated inline and edit mode exits without navigation.
- Edit-template validation passed:
  - create/update/get/preview/delete flow executed against event-template endpoints
  - updated schedule-related fields persisted and preview generation still returned deterministic dates
  - admin frontend build passed after inline edit mode changes.

## 9) Known Constraints / Gaps

- Git remote is configured and push to `origin/master` is working.
- `runtime.txt` (Python 3.11.9) is now at repo root for Render compatibility.
- `requirements.txt` was renamed by git from `api/requirements.txt` to `requirements.txt` at repo root; `render.yaml` `buildCommand` may need updating if Render resolves paths relative to `rootDir: api`.
- Some untracked image assets are present and intentionally not auto-committed.

## 10) Session Update Protocol (for Copilot)

At end of each implementation session, update:
1. Date/time and latest commit hash.
2. Completed Work with TASK IDs and outcomes.
3. Pending backlog and priorities.
4. Any behavior changes that affect operations.

Definition of done for a TASK:
- code merged in local commit,
- build/errors checked,
- behavior notes documented in this brief.

# Recovery Rule
If authentication fails unexpectedly:
- First verify bcrypt version
- Then verify user was created AFTER bcrypt fix
- Then verify login uses "username" (email)
