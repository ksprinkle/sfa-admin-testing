# Surfers For Autism – Dev Notes

## Current State (Stable)
- Backend running cleanly
- Event creation working
- Participant signup working
- Duplicate participant signups return 409
- Database reset required after schema changes (SQLite)

## Known Design Choices
- Participants linked to events by slug
- Duplicate prevention enforced via DB unique constraint
- Admin-only event creation and updates

## Next Ideas (Do NOT start yet)
- Implement participant counts via COUNT query
- Add GET /events/{slug}/participants
- Improve GET /events search robustness
