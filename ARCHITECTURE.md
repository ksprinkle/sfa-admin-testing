ARCHITECTURE.md
# Surfers For Autism – System Architecture

This document describes the structure and data flow of the Surfers For Autism admin platform.

---

# System Overview


Frontend (React PWA)
│
│ REST API
▼
Backend (FastAPI)
│
│ ORM
▼
Database (SQLite / Postgres future)


---

# Backend Structure


backend/api
│
├── models
│ ├── events.py
│ ├── participants.py
│ └── users.py
│
├── schemas
│ ├── events.py
│ └── participants.py
│
├── crud
│ ├── events.py
│ └── participants.py
│
├── routers
│ ├── events.py
│ ├── admin_events.py
│ └── auth.py
│
├── dependencies.py
├── security.py
├── db
│ ├── base.py
│ └── session.py
│
└── main.py


---

# Frontend Structure


frontend/admin-app/src
│
├── api
│ └── events.js
│
├── components
│ ├── BottomNav.jsx
│ ├── TopBar.jsx
│ └── ParticipantTable.jsx
│
├── pages
│ ├── Dashboard.jsx
│ ├── Events.jsx
│ ├── EventDetail.jsx
│ ├── CheckIn.jsx
│ ├── Participants.jsx
│ ├── CreateEvent.jsx
│ └── EditEvent.jsx
│
└── App.jsx


---

# Core Data Model

## Event


id
title
slug
event_type
status
start_date
end_date
location
participant_capacity
volunteer_capacity


Relationships:


Event
└── Participants


---

## Participant


id
event_id
first_name
last_name
email
role
is_minor
is_waitlisted
checked_in
checked_in_at
created_at


Future fields planned:


waiver_signed
waiver_verified
waiver_signed_at


---

# Event Lifecycle


Create Event
↓
Open Registration
↓
Participants Register
↓
Capacity Reached → Waitlist
↓
Event Day
↓
Participant Check-In


---

# Waitlist Logic


capacity reached
↓
new participants waitlisted
↓
participant cancels
↓
first waitlisted promoted


Handled in backend CRUD logic.

---

# Event Check-In Flow


Admin Dashboard
↓
Select Event
↓
Start Check-In Mode
↓
Search participant
↓
Select participant
↓
Check in


Backend endpoint:


PATCH /admin/events/{event_id}/participants/{participant_id}/checkin


---

# Authentication Flow


Login
↓
JWT token issued
↓
Stored in localStorage
↓
Sent in Authorization header


Header format:


Authorization: Bearer <token>


---

# API Flow Example


React CheckIn.jsx
↓
api/events.js
↓
PATCH /admin/events/{event_id}/participants/{participant_id}/checkin
↓
FastAPI Router
↓
SQLAlchemy update
↓
Database commit


---

# Future Architecture Additions

## Digital Waivers


Participant registers
↓
Waiver signed digitally
↓
waiver_verified = true
↓
Check-in allowed


---

## QR Code Check-In


Registration
↓
QR code generated
↓
Event staff scans QR
↓
Participant auto-selected
↓
Check-in


---

## Equipment Tracking


Participant
↓
Assigned volunteer
↓
Assigned surfboard
↓
Assigned wetsuit


---

# Long-Term Vision

The system will evolve into a full **event operations platform** including:


event planning
registration
waiver management
volunteer coordination
equipment tracking
live dashboards