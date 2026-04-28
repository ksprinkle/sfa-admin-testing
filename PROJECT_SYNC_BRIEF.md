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

Date: 2026-04-28
Prepared by: GitHub Copilot (implementation record)
Branch: master
Latest implementation commit: f40e6dc
Current workspace status: uncommitted Check-In tab UX updates present (April 28 session)
Previous release-prep commit: be77f16
Local release tag: v0.1.0 (local only; remote not configured)

## Session Delta (Uncommitted - April 28, Check-In Routing UX)

### Check-In Tab Event-Selection Guidance
Status: Implemented in working tree (not yet committed)
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

## Session Delta (Uncommitted - April 28)

### Offline Queue Row-Level Sync UX
Status: Implemented in working tree (not yet committed)
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
