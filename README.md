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
README.md
# Surfers For Autism – Admin PWA

Admin dashboard and event operations system for the **Surfers For Autism** platform.

This system manages events, participant registrations, waitlists, and live event-day check-in.

The application is built as a **Progressive Web App (PWA)** so it can run on **phones, tablets, and laptops during events**.

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

Inside the frontend directory:


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