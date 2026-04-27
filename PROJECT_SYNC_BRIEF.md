# Project Sync Brief

## Copilot Intake Starter

Copy and paste these 3 lines into Copilot at session start:
1. Use PROJECT_SYNC_BRIEF.md as implementation truth and current state.
2. Treat ROADMAP_INTENT.md as planning input only unless commit-backed here.
3. Implement approved items only, then update this brief with commit evidence.

## New Chat Starter (Copy/Paste)

Use this when opening a brand-new chat so session context stays aligned.

Use PROJECT_SYNC_BRIEF.md as implementation truth and current state.
Treat ROADMAP_INTENT.md as planning intent only.
Today's objective: <one sentence>.
In scope: <items>. Out of scope: <items>.
Success criteria: <list>.
Start from branch <name>, commit <hash>.
Implement now with minimal safe changes, then update PROJECT_SYNC_BRIEF.md with results and commit evidence.

Date: 2026-04-26
Prepared by: GitHub Copilot (implementation record)
Branch: master
Latest implementation commit: 86f9918
Previous release-prep commit: be77f16
Local release tag: v0.1.0 (local only; remote not configured)

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

## 4) In Progress

- None currently marked in-progress.

## 5) Pending / Next Backlog Candidates

- Add per-row "pending sync" indicators in Participants and Event Detail.
- Add queue conflict resolution UX for server-side rejects after reconnect.
- Add automated smoke script for offline queue scenarios.
- Add release publish workflow once git remote is configured.

## 6) API / Data Contract Notes

- Priority update endpoint uses query parameter (`priority`) not JSON body.
- Volunteer capacity currently informational, not enforced for participant seat limits.
- Real-time updates use websocket endpoint `/api/ws/updates`.

## 7) Frontend Behavior Notes

- Primary admin app is under `admin-app`.
- In dev, API base resolves to current host (`window.location.hostname`) to support phone/laptop testing on LAN.
- Participants/Event Detail/Check-In now each include offline queue and sync retry behavior for supported actions.

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

## 9) Known Constraints / Gaps

- Git remote is not configured in this local repo, so push/tag publish is pending setup.
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
