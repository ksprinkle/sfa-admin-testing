# Surfers For Autism Admin PWA - Release v0.1.0

Date: 2026-04-26
Tag: v0.1.0
Commit: be77f16

## Highlights

- Added build fingerprint visibility in the admin UI so teams can quickly confirm phone/laptop parity.
- Hardened PWA update behavior to reduce stale-client issues on mobile devices.
- Fixed Event Type chip/badge wrapping behavior on smaller screens.
- Cleaned up Check-In by removing dev-only diagnostics controls after validation.
- Added offline-first action handling across participant-management pages.

## User-Facing Improvements

- Build badge now reflects deterministic build metadata rather than ambiguous local fallback.
- Event Type chips and table badges retain pill shape and no-wrap text on mobile.
- Check-In remains fast and stable with realtime updates and queue fallback behavior preserved.
- Participants and Event Detail now keep user edits locally during offline periods and sync automatically after reconnect.

## Technical Changes

- Version bump:
  - admin-app/package.json: 0.1.0
- Build metadata:
  - Vite now defines:
    - import.meta.env.VITE_APP_VERSION
    - import.meta.env.VITE_BUILD_ID (v<version>-<gitShortHash>)
- PWA/service worker:
  - Cache strategy updated to network-first for navigations and critical assets.
  - Cache version bumped to force stale-bundle turnover.
- Check-In cleanup:
  - Removed dev diagnostics panel and simulation toggles.
  - Kept websocket realtime path, polling fallback, and offline queue retry behavior.
- Offline-first participant workflows:
  - Participants page queues offline mutations (check-in, waiver, promote, remove, priority/type updates) and applies local optimistic state.
  - Event Detail queues offline session-move and priority changes with local optimistic state.
  - Offline queue count banners added for operator visibility.

## Smoke Validation

- Backend health endpoints responded successfully:
  - GET /
  - GET /openapi.json
- Frontend build succeeded:
  - npm run build (admin-app)
  - hashed JS artifact generated in dist/assets
- Git state:
  - tag v0.1.0 created locally and points at be77f16

## Notes

- Remote push is pending because no git remote is configured in this local repository.
- Local untracked image assets remain uncommitted and were intentionally not included in release commit/tag.
