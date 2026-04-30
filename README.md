# Surfers For Autism – Admin PWA

Admin dashboard and event operations system for the **Surfers For Autism** platform.

This system manages events, participant registrations, waitlists, and live event-day check-in.

The application is built as a **Progressive Web App (PWA)** so it can run on **phones, tablets, and laptops during events**.

## Recent Updates (April 2026)

- Deployment and backend stabilization updates (April 30, 2026):
      - Render service config hardened (`render.yaml`) to use correct service structure and root directory.
      - Render start command aligned with package imports (`uvicorn api.main:app ...`).
      - Backend imports standardized around `api.*` package paths for consistent runtime behavior.
      - Seed/test-user workflow rolled back to restore clean working state after validation.
      - `passlib`/`bcrypt` compatibility fix applied to avoid startup/auth hashing issues.
      - Python dependency versions locked for higher deploy reproducibility.

- Fast Assign mode hardening updates (April 28, 2026):
      - Added Fast Assign event-day workflow at /events/:eventId/fast-assign for one-tap or one-key assignment.
      - Added keyboard shortcuts for speed:
            - Enter assigns best visible option.
            - 1-9 assigns the matching visible session button.
            - S skips current participant.
            - W moves current participant to waitlist.
      - Added recommendation/evaluation batching to reduce per-participant API fan-out and avoid load spikes.
      - Added next-participant recommendation prefetch with cache hygiene (single-entry cache, cleared per event).
      - Added constrained-options warning when all visible options are avoid/full/nearly-full.
      - Added no-recommendations fallback: show all sessions, evaluate them, and remove best-highlight bias.
      - Added Undo Last assignment (5-second window) with generation guard for rapid-input safety.
      - Added assignment failure recovery banner and keyboard debounce guard to prevent duplicate key-repeat submissions.
      - Reduced success flash duration to 700ms to improve throughput while preserving confirmation feedback.

- Event Templates and Tour calendar workflow updates (April 27, 2026):
      - Event Templates date picker now uses month/day/year dropdowns with inline calendar selection.
      - Tour templates now derive default event date from matching historical events with safer fallback matching.
      - "Show Date Calendar" supports all-days clickable mode for quick date picking.
      - Calendar now highlights reference last-event day and keeps selected-day ring behavior stable when changing year/month.
      - Date display timezone handling was normalized to avoid one-day drift in "Last event" labels.
      - Date picker now supports deselecting an actively selected date without forcing year rollback.
      - Event template form now includes expanded logistics/media fields (city/state/coordinates, directions, beach notes, parking/lodging, weather/surf links, featured image, internal notes).
      - Event and Event Template forms now expose a manual `Map URL` field so operators can override the generated map destination.
      - Directions field was moved into "Location Details" for better UX discoverability.
      - Creating an event from template now carries logistics/media fields into the new draft event.
      - Saving an event as template now carries logistics/media/report-link fields into the template for future reuse.
      - Event Detail now prefers manual `map_url` for the Map button, then falls back to coordinate-based Google Maps search.
      - Saving an event as template now backfills a NOAA weather link when coordinates exist but no manual weather URL was stored.

- Release prep updates (April 26, 2026):
      - Admin app version set to `0.1.0` in `admin-app/package.json`.
      - Build fingerprint badge added to the admin shell so phone and laptop can be compared quickly.
      - Vite now injects `VITE_APP_VERSION` and `VITE_BUILD_ID` (version + git short hash).
      - Service worker cache strategy updated to network-first for navigations and critical assets to reduce stale client bundles.
      - Event Type pills/chips hardened against mobile text wrapping (table badge and filter chips).
      - Dev-only troubleshooting panel/toggles removed from Check-In UI after stability validation.
      - Offline-first participant mutations added on key admin pages:
            - Check-In now restores cached roster data and preserves optimistic offline check-ins locally.
            - Participants now applies changes locally while offline and queues action sync for check-in, waiver, promote, remove, priority, and volunteer-type edits.
            - Event Participants (Event Detail) now applies session moves/priority locally while offline and queues sync retries.
      - Offline queue status banners now show pending change counts so operators can confirm local actions are safely queued.

- Admin dashboard and roster semantics update:
      - "Confirmed" metric renamed to "Registered".
      - Added "Cleared to Participate" metric (checked in + waiver verified).
      - Dashboard stat cards now deep-link into filtered event rosters.
- Volunteer capacity policy update:
      - Volunteers are excluded from participant and session seat enforcement.
      - Volunteer assignment/promotion remains allowed even when participant capacity is full.
      - `volunteer_capacity` remains in schemas as informational (not currently enforced).
- Participant administration improvements:
      - Added broad PATCH participant update endpoint for admin workflows.
      - Supports updates for identity/contact fields, role, waiver/check-in flags, notes, priority, and session assignment.
      - Session capacity checks apply to participant seats only (volunteers exempt).
- Participants page refresh behavior:
      - Real-time websocket refresh remains primary.
      - 4-second polling fallback runs while tab is visible to reduce stale screens when reconnecting.

- Participants page mobile compaction:
      - Waiver/Check-In/Status converted to dot indicators with top legend.
      - Column labels updated to WVR/CHK/STS.
      - Table widths/padding tightened to reduce horizontal scrolling.
      - Name/Email/Event cells truncate with hover titles.
- Event Check-In status layout:
      - Added aligned status headers and columns (Waiver, Check-In, Waitlist).
      - Waitlist moved to far-right status column.
      - Status pill padding and status block spacing reduced for denser layout.
- PWA icon setup:
      - Admin app now uses PNG app icons and maskable icon entries in manifest.
      - Home-screen icon behavior aligned for phone and laptop installs.
- Dev reliability improvements:
      - In dev mode, API and websocket calls now default to the current host/IP.
      - This avoids stale `.env` host issues after Wi-Fi changes.
- Repo cleanup:
      - Removed tracked Python cache artifacts from version control.

## Local Dev Runbook (Current)

Backend from repository root:

"c:/Users/caspe/A Local Documents/SFA/PWA Development Files/surfers-for-autism-app/venv/Scripts/python.exe" -m uvicorn api.main:app --host 0.0.0.0 --port 10000

Frontend from admin app folder:

cd admin-app
npm run dev -- --host 0.0.0.0 --port 5173

Common startup notes:

- `npm run dev` at repository root fails because there is no root package.json.
- If backend reports port 10000 already in use, stop the existing process on 10000, then start backend once.
- For phone testing/install, open the frontend via your laptop IPv4 address and port 5173.

---

# Overview

The platform provides administrators tools to:

- create and manage events
- manage participant registrations
- track waitlists
- monitor event capacity
- perform fast participant check-in on event day

The system is optimized for **large beach events with hundreds of participants and volunteers**.

---

# Tech Stack
System Architecture

The Surfers For Autism admin system follows a three-layer architecture:

┌──────────────────────────────────────┐
│            React Admin PWA           │
│                                      │
│  Dashboard                           │
│  Events                              │
│  Event Detail                        │
│  Participants                        │
│  Check-In Mode                       │
│                                      │
│  src/pages                           │
│  src/components                      │
│  src/api/events.js                   │
└───────────────▲──────────────────────┘
                │
                │ REST API (JSON)
                │
┌───────────────┴──────────────────────┐
│              FastAPI Backend         │
│                                      │
│  Routers                             │
│   /events                            │
│   /admin/events                      │
│   /auth                              │
│                                      │
│  Business Logic                      │
│   capacity enforcement               │
│   waitlist promotion                 │
│   participant check-in               │
│                                      │
│  JWT Authentication                  │
└───────────────▲──────────────────────┘
                │
                │ SQLAlchemy ORM
                │
┌───────────────┴──────────────────────┐
│                Database              │
│                                      │
│  Events                              │
│  Participants                        │
│  Users                               │
│                                      │
│  SQLite (local dev)                  │
│  PostgreSQL (future production)      │
└──────────────────────────────────────┘
Event Check-In Flow
Admin Dashboard
      │
      ▼
Events List
      │
      ▼
Event Detail
      │
      ▼
Start Check-In Mode
      │
      ▼
Search Participant
      │
      ▼
Select Participant
      │
      ▼
PATCH /admin/events/{event_id}/participants/{participant_id}/checkin
      │
      ▼
Database Update
Frontend Data Flow
React Page
   │
   ▼
src/api/events.js
   │
   ▼
FastAPI Route
   │
   ▼
CRUD Logic
   │
   ▼
SQLAlchemy
   │
   ▼
Database
Backend Folder Architecture
backend/api
│
├── models
│   ├── events.py
│   ├── participants.py
│   └── users.py
│
├── schemas
│   ├── events.py
│   └── participants.py
│
├── crud
│   ├── events.py
│   └── participants.py
│
├── routers
│   ├── events.py
│   ├── admin_events.py
│   └── auth.py
│
├── db
│   ├── base.py
│   └── session.py
│
├── dependencies.py
└── main.py
Frontend Folder Architecture
frontend/admin-app/src
│
├── api
│   └── events.js
│
├── components
│   ├── BottomNav.jsx
│   ├── TopBar.jsx
│   └── ParticipantTable.jsx
│
├── pages
│   ├── Dashboard.jsx
│   ├── Events.jsx
│   ├── EventDetail.jsx
│   ├── CheckIn.jsx
│   ├── Participants.jsx
│   ├── CreateEvent.jsx
│   └── EditEvent.jsx
│
└── App.jsx
Future System Extensions

Planned architecture expansions include:

Digital Waiver System
QR Code Check-In
Volunteer Management
Equipment Assignment
Real-Time Event Dashboards
## Backend

- FastAPI
- SQLAlchemy
- Pydantic v2
- SQLite (local development)
- JWT authentication
- UUID primary keys

Backend structure:


backend/api
models
schemas
crud
routers
dependencies
db


---

## Frontend

- React
- Vite
- TailwindCSS
- LocalStorage JWT authentication

Frontend structure:


frontend/admin-app/src
pages
components
api


---

# Key Features

## Event Management

Admins can:

- create events
- edit events
- archive events
- delete events

Events contain:


title
slug
event type
status
dates
location
capacity
registration settings


---

## Participant Registration

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


---

# Waitlist System

When event capacity is reached:


new participants → waitlisted


If a participant cancels or capacity increases:


first waitlisted participant is automatically promoted


Promotion logic runs automatically on the backend.

---

# Admin Dashboard

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


---

# Event Day Check-In

The platform includes a **live event check-in interface** optimized for fast participant check-in.

Navigation:


Dashboard
↓
Events
↓
Select Event
↓
Start Event Check-In


---

## Check-In Workflow

1. Staff searches for a participant.
2. Staff selects the participant.
3. Staff clicks **Check In Selected Participant**.
4. Backend updates participant status.

Database update:


checked_in = true
checked_in_at = timestamp


The UI updates immediately.

---

# API Overview

## Admin Event Routes


GET /admin/events
GET /admin/events/{event_id}
PUT /admin/events/{event_id}
DELETE /admin/events/{event_id}


---

## Participant Routes


GET /admin/events/{event_id}/participants
DELETE /admin/events/{event_id}/participants/{participant_id}


---

## Check-In Endpoint


PATCH /admin/events/{event_id}/participants/{participant_id}/checkin


Updates:


checked_in = true
checked_in_at = datetime


---

# Authentication

Authentication uses **JWT tokens**.

Admin-only routes require:


Authorization: Bearer <token>


Role-based protection is implemented through dependency injection.

---

# Local Development

## Start Backend


uvicorn api.main:app --reload


Backend runs at:


http://localhost:8000


---

## Start Frontend

Inside the admin-app directory:


cd admin-app
npm install
npm run dev


Frontend runs at:


http://localhost:5173


---

# Database

Local development uses SQLite:


sfa.db


Schema changes during development may require resetting the database.

---

# Planned Features

Future improvements include:


digital waivers
QR code check-in
volunteer check-in
equipment tracking
live event dashboards


---

# Status

This project is under **active development**.

---

# Verified Backend Runbook (April 2026)

Use this command from the project root for local backend startup:

```powershell
& "c:/Users/caspe/A Local Documents/SFA/PWA Development Files/surfers-for-autism-app/venv/Scripts/python.exe" -m uvicorn main:app --reload --app-dir api
```

Quick smoke checks (PowerShell):

```powershell
(Invoke-WebRequest -Uri "http://127.0.0.1:8000/" -UseBasicParsing).StatusCode
(Invoke-WebRequest -Uri "http://127.0.0.1:8000/debug/routes" -UseBasicParsing).StatusCode
(Invoke-WebRequest -Uri "http://127.0.0.1:8000/openapi.json" -UseBasicParsing).StatusCode
(Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/events" -UseBasicParsing).StatusCode
```

Expected status codes for public routes above: 200.

Admin route note:

- This app uses strict slash behavior (`redirect_slashes=False`).
- Use trailing slashes for list routes:
      - `/api/admin/events/`
      - `/api/admin/participants/`
- Without auth token, these admin routes should return 401.
- Without trailing slash on list routes, they return 404.

---

# Verified Frontend Runbook (April 2026)

The frontend currently served for development is `admin-app`.

Run from project root:

```powershell
cd admin-app
npm install
npm run dev
```

Then open:

```text
http://localhost:5173/
```

Important notes:

- Running `npm run dev` from the project root fails because there is no root `package.json`.
- `frontend/package.json` currently does not define `scripts.dev`, so use `admin-app` for active UI development.

---

# Backend Stabilization Notes (April 2026)

- Import paths were normalized to `api.*` to prevent duplicate SQLAlchemy module loading.
- This resolved the `Table 'events' is already defined for this MetaData instance` startup failure.
- Event ORM model was aligned with the current SQLite schema (location, capacity, registration flags, media, and no-show config fields).
- `Event.participants` relationship was restored to match `Participant.event` back-populates.
- `api/main.py` was cleaned up to remove duplicate imports and redundant engine creation.