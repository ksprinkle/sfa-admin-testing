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