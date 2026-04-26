# Project Sync Brief

## Copilot Intake Starter

Copy and paste these 3 lines into Copilot at session start:
1. Use PROJECT_SYNC_BRIEF.md as implementation truth and current state.
2. Treat ROADMAP_INTENT.md as planning input only unless commit-backed here.
3. Implement approved items only, then update this brief with commit evidence.

Date: 2026-04-26
Prepared by: GitHub Copilot (implementation record)
Branch: master
Latest implementation commit: 3bd41d7
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
