# Surfers For Autism – PWA Backend

Backend for the Surfers For Autism progressive web app.

## Current Features
- Event creation and update (admin-only)
- Public event access by slug
- Participant registration for events
- Duplicate participant prevention (409 Conflict)
- Registration open/close controls
- Participant capacity enforced using live database COUNT queries (no stored counters)

## Tech Stack
- FastAPI
- SQLAlchemy
- SQLite (local development)
- Python

## Important Notes
- SQLite database (`sfa.db`) is excluded from Git and recreated as needed
- Schema changes require database reset in local dev
- Admin access is controlled via `x-admin` header

## Status
This project is under active development.
