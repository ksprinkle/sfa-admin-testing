# Surfers For Autism Admin PWA - Release v0.2.0-rc.1

Date: 2026-07-05
Candidate tag: v0.2.0-rc.1
Previous release tag: v0.1.0

## Release Scope

This release candidate includes the completed Admin PWA feature set delivered after v0.1.0, plus release hardening and stabilization updates.
No architecture redesigns were introduced as part of this release-preparation cycle.

## User-Facing Features Included Since v0.1.0

- Dashboard enhancements with expanded operational cards and workflows.
- Live telemetry integration in the dashboard runtime.
- Operational attention panel for rapid issue visibility.
- Today overview section for current-day event focus.
- Global application search for cross-page navigation.
- Dashboard preferences with customizable operator defaults.
- Bulk participant actions to reduce repetitive roster operations.
- Universal command palette with keyboard-first command execution.
- Cross-feature polish and stabilization across major operator routes.

## Technical and Release Metadata Updates

- Admin app version updated to `0.2.0-rc.1` in `admin-app/package.json`.
- Feedback/release display metadata updated in `admin-app/src/config/release.js`.
- Practical RC testing and feedback checklist updated in `SFA practical production-readiness.txt`.
- Current status and baseline tracking updated in `PROJECT_SYNC_BRIEF.md` and `PROJECT_BASELINE_v1.22.0-beta-rc1.md`.
- Release preflight script fixed for strict-mode parameter handling in `scripts/release-preflight.ps1`.

## Validation Summary

- Frontend lint: passed.
- Frontend production build (`npm run build` in `admin-app`): passed.
- Release preflight: passes from a clean working tree and enforces release hygiene gates.

## Tagging and Deployment Readiness

Repository is prepared for annotated tag creation:

- Tag: `v0.2.0-rc.1`
- Recommended tag message: `Admin PWA beta release candidate v0.2.0-rc.1`

Deployment readiness:

- Production build output is generated successfully.
- Release notes and testing checklist are updated for RC handoff.
