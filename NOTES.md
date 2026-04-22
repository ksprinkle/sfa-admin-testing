# Recent Changes (Spring 2026)

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
vendors
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