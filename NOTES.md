# Recent Changes (Spring 2026)

## Latest Updates (April 30, 2026)

### UI Theme System
- Introduced CSS variable theme tokens in `admin-app/src/index.css`:
  - `--color-primary`, `--bg-card`, `--text-secondary`, `--radius-lg`, `--shadow-sm`
- Added global typography scale (h1–h3, body, small, label) and `card-in` fade-in animation with `prefers-reduced-motion` safeguard.
- Introduced reusable `Card` and `Button` components consuming theme tokens.
- Standardized all helper/label/metadata text across every major page and component to use `.text-secondary` (replacing scattered `text-gray-*` inline classes):
  - EventDetail, FastAssign, Events, Dashboard, CheckIn, EventTemplates
  - ParticipantForm, EventForm, TopBar, Drawer
- Build validated clean after all changes (`npm run build` — no new errors).
- Commit: `0b7e801`

### Python Runtime Pin
- Added `runtime.txt` with `python-3.11.9` at repo root for Render deployment Python version targeting.
- Commits: `7558e60` (create), `184f58c` (move to repo root)

### Deployment + Runtime Stability
- Render deployment configuration was normalized in `render.yaml`:
  - service structure corrected (`static`/`web` alignment)
  - root directory and startup behavior aligned for backend package execution
- Render/backend startup command standardized to package entrypoint form:
  - `uvicorn api.main:app --host 0.0.0.0 --port 10000`

### Import + Dependency Hardening
- Backend imports were standardized for consistency under package execution (`api.*` pathing).
- Added bcrypt/passlib compatibility adjustment to prevent auth/hash runtime failures.
- Locked selected backend dependency versions to reduce environment drift between local and cloud builds.

### State Cleanup
- Temporary seed-admin/test-data workflow was reversed to restore the intended working state after smoke validation.

## Latest Updates (April 26, 2026)

### Versioning + Build Visibility
- Admin app package version updated to `0.1.0`.
- Added build fingerprint badge in the admin shell for cross-device parity checks.
- Vite now defines:
  - `import.meta.env.VITE_APP_VERSION`
  - `import.meta.env.VITE_BUILD_ID` (`v<version>-<gitShortHash>`)

### PWA Freshness + Mobile UI Reliability
- Updated service worker strategy to network-first for HTML/JS/CSS/core assets.
- Bumped service worker cache version to invalidate stale bundles.
- Hardened Event Type pills/chips with explicit no-wrap behavior for small screens.

### Check-In UI Cleanup
- Removed dev-only diagnostics panel and simulation toggles from Check-In.
- Retained production behavior:
  - websocket realtime updates
  - polling fallback when websocket is not open
  - offline queue + retry behavior

### Offline-First Action Sync (Cross-Page)
- Participants page now supports offline-first mutations with queued sync:
  - check-in, waiver verify, promote, remove
  - priority updates
  - participant/volunteer type and role updates
- Event Detail page now supports offline-first mutations with queued sync:
  - drag/drop session moves
  - priority updates
- Check-In page now restores cached roster data when offline and persists optimistic check-in state locally.
- Added visible offline queue banners to show pending sync counts while connectivity is unavailable.

## Latest Updates (April 23, 2026)

### Metrics + Terminology Alignment
- Replaced "Confirmed" with "Registered" in dashboard and drill-down routes.
- Added "Cleared to Participate" count and filter (`checked_in && waiver_verified`).
- Event and dashboard summaries now report registered, waitlisted, checked-in, waivers-missing, and volunteer counts with clearer semantics.

### Volunteer Capacity Policy
- Volunteers are treated as unlimited for current operations.
- Volunteer records are excluded from participant/session seat-capacity enforcement.
- Waitlist promotion for volunteers now bypasses participant-capacity checks.
- `volunteer_capacity` fields remain available in API models as informational (non-enforced for now).

### Admin Participant API Expansion
- Added comprehensive `PATCH /api/admin/participants/{participant_id}` endpoint.
- Supports first/last name, email, role, minor flag, waitlist, priority, waiver state, check-in state, notes, and session assignment updates.
- Includes duplicate-email protection and role-aware session validation.

### Participants Page Refresh Behavior
- Continuous `GET /api/admin/participants/` logs every few seconds are expected with current fallback strategy.
- The page refreshes from websocket events and also runs a visible-tab polling fallback every 4 seconds.

## Latest Updates (April 22, 2026)

### Participants Page Mobile Compaction
- Converted Waiver, Check-In, and Status table cells to dot indicators for tighter mobile layout.
- Added top legend for Waiver, Check-In, and Status dot meanings.
- Updated column labels from single-letter to clearer three-letter labels: WVR, CHK, STS.
- Tightened table spacing and widths (including Name, Email, Event, Priority, dot columns, and Actions) to reduce horizontal scroll.
- Added truncation with hover titles for Name, Email, and Event cells to keep rows compact.
- Updated status dot colors for better visibility (especially Waitlisted and Confirmed).

### Event Check-In Status Layout Improvements
- Added explicit status headers and three aligned status columns in normal mode: Waiver, Check-In, Waitlist.
- Moved Waitlist to the far-right status column as requested.
- Reduced pill background padding and status-area width for denser row layout.
- Reduced spacing between participant details and status columns for better balance.

### PWA/App Icon Updates
- Added and wired maskable icon assets for both standard and mask-safe variants.
- Updated admin app manifest and HTML icon tags to use PNG icons instead of the default Vite SVG icon.
- Verified icon files are available under admin-app public assets and correctly referenced.

### Dev Networking and API Reliability
- Updated admin app API/auth base URL logic in dev mode to use the current browser host (`window.location.hostname`) instead of stale env host values.
- Applied the same dev-host strategy for websocket base URLs in Check-In, Participants, and Event Detail pages.
- This fixes common laptop/phone mismatch after Wi-Fi network changes.

### Repository Hygiene
- Removed tracked Python cache artifacts from version control (`__pycache__` .pyc files).


## Priority System & UI/UX Overhaul
- Participant priority is now a 3-level system:
  - 1 = High (Red)
  - 2 = Medium (Yellow)
  - 3 = Low (Gray)
  - 0 = Unset (Gray)
- Priority can only be changed from the **Participants** page (table view) using a dropdown.
- On the **Event Participants** page, priority is display-only (color dot, no controls).
- Priority legend is visible at the top right of the Event Participants page.
- Drag-and-drop session assignment for participants remains available.
- When attempting to drag a participant into a full session, a notification appears at the top of the page with a close button.
- All error and status notifications are now more visible and user-friendly.

## Backend/API Updates
- Priority update endpoint expects the priority as a query parameter (not JSON body).
- All priority values are clamped between 0 and 3 on the backend.
- Participant model and schema updated to reflect new priority logic.
- Event title is now correctly displayed for each participant (fixed test data issue).

## Dashboard & Stats
- Dashboard and event detail stats now accurately reflect checked-in, waitlisted, and confirmed participants.
- Capacity bar and participant counts are always up-to-date and correct.

## General Improvements & Bug Fixes
- All participant tables now show priority with a colored dot and legend.
- Consistent color logic and legend across all participant views.
- Improved error handling and UI feedback for all participant actions.
- Fixed duplicate function declarations and improved code maintainability.
- Cleaned up debug logs and improved developer experience.

## Verified Setup + Stabilization (April 2026)
- Backend startup command from project root:
  - `& "c:/Users/caspe/A Local Documents/SFA/PWA Development Files/surfers-for-autism-app/venv/Scripts/python.exe" -m uvicorn main:app --reload --app-dir api`
- Frontend startup command from project root:
  - `cd admin-app`
  - `npm install`
  - `npm run dev`
- `npm run dev` at workspace root fails (no root `package.json`).
- `frontend/package.json` currently has no `scripts.dev`; active UI app is `admin-app`.

## Backend Fixes Verified in Smoke Tests
- Normalized backend imports to `api.*` to avoid duplicate module loading.
- Fixed SQLAlchemy startup error: `Table 'events' is already defined for this MetaData instance`.
- Restored `Event.participants` relationship for mapper consistency.
- Aligned `Event` ORM fields with the current `events` DB table to prevent runtime attribute errors.
- Confirmed healthy endpoints: `/`, `/debug/routes`, `/openapi.json`, `/api/events`.
- Confirmed admin route behavior:
  - trailing slash required for list routes (`/api/admin/events/`, `/api/admin/participants/`)
  - unauthenticated access returns 401
  - authenticated admin access returns 200

## Pending Product Decision
- Soft timer grace period: waiting on client confirmation.
- Current behavior shows countdown until session start, then a non-enforcing not-checked-in warning.
- Potential later update (if approved): delay warning until an agreed grace period elapses after session start.

## Build-Only Changelog (April 22, 2026)
- Offline check-in queue reliability improved on the check-in page:
  - optimistic check-in retained during offline scenarios
  - guarded queue flushes to prevent overlapping sync calls
  - periodic retry plus focus/visibility retries for queue drain
  - clearer offline queue status messaging
- Cross-device sync reliability improved:
  - websocket auto-reconnect added on check-in, participants, and event detail pages
  - fallback polling refresh added for stale websocket periods
- Backend realtime update path completed:
  - admin check-in endpoint now broadcasts participant updates after commit
  - websocket manager now safely removes dead sockets instead of breaking broadcasts
- Check-in selection and action UX improved:
  - no implicit auto-selection after refresh
  - explicit row-click selection behavior
  - bulk check-in only submits valid selected participants
  - Enter key requires explicit active selection
  - desktop row-click jump-to-top behavior fixed
- Dev consistency improvements:
  - API fetches now use no-store cache mode to reduce stale responses
  - service worker is disabled/unregistered in development to avoid stale bundles during testing
- Login feedback improvements:
  - auth API now respects VITE_API_URL fallback behavior
  - login view now surfaces backend error details when available

Surfers For Autism – Admin PWA

Admin dashboard and event operations system for the Surfers For Autism platform.

This application manages events, participant registration, waitlists, and live event-day check-in.

The system is designed to run as a Progressive Web App (PWA) so it can be used on phones, tablets, and laptops during events.

Overview

The platform provides tools for administrators to:

create and manage events

manage participant registrations

track waitlists

monitor event capacity

perform fast participant check-in on event day

The system is designed specifically for large beach events with hundreds of participants and volunteers.

Tech Stack
Backend
FastAPI
SQLAlchemy
Pydantic v2
SQLite (local development)
JWT authentication
UUID primary keys

Backend structure:

backend/api
  models
  schemas
  crud
  routers
  dependencies
  db
Frontend
React
Vite
TailwindCSS
LocalStorage JWT authentication

Frontend structure:

frontend/admin-app/src
  pages
  components
  api
Key Features
Event Management

Admins can:

create events

edit events

archive events

delete events

Events contain:

title
slug
event type
status
dates
location
capacity
registration settings
Participant Registration

Participants register for events.

The system enforces:

duplicate prevention
participant capacity limits
automatic waitlists

Participant data includes:

first_name
last_name
email
role
minor status
waitlist status
check-in status
Waitlist System

When event capacity is reached:

new participants → waitlisted

If a participant cancels or capacity increases:

first waitlisted participant is automatically promoted

Promotion logic runs automatically on the backend.

Admin Dashboard

The dashboard provides a quick overview of all events.

Metrics include:

total events
participant counts
waitlist counts
check-in counts

Each event displays:

capacity progress
participant count
waitlist count
checked-in count
Participant Management

Admins can:

view event participants
search participants
remove participants

Participants can be filtered by:

checked-in status
Event Day Check-In System

The platform includes a live event check-in interface optimized for fast participant check-in.

Navigation:

Dashboard
↓
Events
↓
Select Event
↓
Start Event Check-In
Check-In Screen

Features:

participant search
row selection
check-in button
status indicators

Participant states:

Registered
Waitlisted
Checked In
Check-In Workflow

Staff searches for a participant.

Staff selects the participant.

Staff clicks Check In Selected Participant.

Backend updates participant status.

Database update:

checked_in = true
checked_in_at = timestamp

The UI updates immediately.

API Overview
Admin Event Routes
GET    /admin/events
GET    /admin/events/{event_id}
PUT    /admin/events/{event_id}
DELETE /admin/events/{event_id}
Participant Routes
GET    /admin/events/{event_id}/participants
DELETE /admin/events/{event_id}/participants/{participant_id}
Check-In Endpoint
PATCH /admin/events/{event_id}/participants/{participant_id}/checkin

Updates:

checked_in = true
checked_in_at = datetime
Planned Features
Waiver Verification

Participants will be required to have a verified waiver before check-in.

Future participant fields:

waiver_signed
waiver_verified
waiver_signed_at

Check-in will require:

waiver_verified = true
Digital Waivers

Participants will eventually be able to:

sign waivers electronically

Possible approaches:

embedded digital signature
PDF waiver upload
external signature provider
QR Code Check-In

Participants will receive a QR code after registration.

Event staff can scan the QR code to instantly check in participants.

Volunteer Check-In

Separate workflows for:

volunteers
exhibitors
staff
Equipment Tracking

Future event management tools may include tracking of:

surfboards
wetsuits
volunteer assignments
Authentication

Authentication uses JWT tokens.

Admin-only routes require:

Authorization: Bearer <token>

Role-based protection is implemented through dependency injection.

Local Development
Start Backend
uvicorn api.main:app --reload

Backend will run at:

http://localhost:8000
Start Frontend

Inside the frontend directory:

npm install
npm run dev

Frontend runs at:

http://localhost:5173
Database

Local development uses SQLite.

sfa.db

Schema changes during development may require resetting the database.

Long-Term Vision

The system is intended to evolve into a complete event operations platform for Surfers For Autism including:

event planning
participant registration
digital waivers
equipment tracking
volunteer coordination
real-time event dashboards
Status

The project is currently under active development.

New features and improvements are continuously being added as the platform evolves.