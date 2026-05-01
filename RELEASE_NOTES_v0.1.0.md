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

## Post-v0.1.0 Maintenance (2026-04-27)

- Event lifecycle safety and auditability:
  - Added event activity logging for cancel/delete/status-change/auto-archive actions.
  - Added Removed Events History panel on Events page with filters, paging, and CSV export.
  - Added cancel reason capture and delete reason capture in Events UI and API payloads.
  - Added auto-archive logging when published events pass their event date.
- Template delete protection:
  - Event Templates delete now requires typed confirmation to reduce accidental deletion.
  - Confirmation accepts either `delete` (case-insensitive) or a one-time 4-digit code shown in prompt.
- Offline queue UX visibility:
  - Participants rows now show per-row sync state for queued offline actions.
  - Event Detail participant cards now show per-card sync state for queued session move/priority updates.
  - Failed queued items surface lightweight inline error detail and a retry action without reverting optimistic UI.
  - Queue banners now summarize pending and failed counts more clearly.
  - Added global `Retry All Failed (n)` queue action in Participants and Event Detail.
  - Added consistent icon-based sync indicators for row/card queue states.

- Event Templates UX:
  - Replaced native date input behavior with month/day/year selectors and inline "Show Date Calendar" picker.
  - Added stable reference-day highlighting for Tour default date context and improved selected-day interaction (including deselect).
  - Fixed date-label consistency and timezone-safe rendering for "Last event" date display.
  - Added editable `Map URL` inputs to both Event and Event Template forms so operators can override generated map links.
- Template data coverage:
  - Extended template schema/model/migration to support logistics/media/report-link fields used by events.
  - Updated template-to-event creation path to carry these fields into newly created draft events.
  - Updated save-event-as-template path to carry existing event logistics/media/report-link values into templates.
  - Added `map_url` persistence for events and templates, including inheritance from template to created event.
  - Added NOAA weather-link fallback during save-as-template when coordinates exist but `weather_report_url` is blank.
- Form and layout improvements:
  - Expanded Event Template form to edit logistics/media values directly.
  - Moved Directions input into Location Details to better match operator expectations.
  - Event Detail Map button now honors manual map URLs before using generated coordinate/location fallbacks.

Note: These maintenance updates are being accumulated into local maintenance commits after v0.1.0.

## Fast Assign Mode Delivery (v0.19) - 2026-04-28

Tag: v0.19-fast-assign-mode
Base Commit: 6b2b6d6

### Highlights

- Added a dedicated Fast Assign mode optimized for live event-day throughput.
- Reused existing recommendation and assignment-evaluation engines to preserve decision quality.
- Introduced touch-first and keyboard-first workflows for rapid participant assignment.

### User-Facing Improvements

- New route: /events/:eventId/fast-assign.
- Large session action buttons with Good/Caution/Avoid visual guidance and capacity context.
- Best-option emphasis (ring + star) when a recommendation exists.
- Secondary operator actions: Skip and Waitlist.
- Progress indicator with stable denominator and subtle top progress bar.
- Undo Last assignment with a 5-second window.

### Hardening Updates

- Batch evaluation endpoint and frontend usage reduce N assignment-evaluation requests to 1 request per participant.
- Race-condition guards for recommendation/evaluation fetches prevent stale UI overwrite.
- Next-participant prefetch added to reduce transition latency between participants.
- Prefetch cache hygiene added (cleared on event change, one participant ahead cached).
- Keyboard debounce guard prevents accidental duplicate key-repeat submissions.
- Assignment failure recovery now shows a red failure flash while preserving current participant and queue position.
- No-recommendations fallback now shows all sessions, removes best-option bias, and displays operator guidance.
- Constrained-options banner added when all visible sessions are avoid/full/nearly-full.

### Validation Summary

- Assignment loop remains non-blocking and rapid under keyboard-heavy use.
- Undo guard uses assignment generation tracking to avoid stale undo collisions.
- Guidance remains visible during constrained and recommendation-sparse scenarios.

## Post-v0.1.0 Maintenance (2026-04-30)

### Deployment and Runtime Stability

- Render service configuration normalized to correct structure and root directory behavior.
- Render backend startup command aligned to package entrypoint usage (`uvicorn api.main:app`).
- Startup/deploy path now matches package-based import strategy used in backend modules.

### Compatibility and Reproducibility

- Added bcrypt/passlib compatibility fix to prevent auth hashing/runtime incompatibilities.
- Locked dependency versions to improve repeatability across local and cloud environments.

### Cleanup and State Restoration

- Seed admin/testing changes were rolled back to restore expected working state after smoke tests.
- Import consistency cleanup completed to reduce deployment-time module resolution drift.

### Commit Trail (April 30 sequence)

- `64b9e9f` fix render start command
- `88de896` fix render.yaml static -> web
- `d730a88` fix render.yaml structure and rootDir
- `6f2f8bd` fix import consistency (api package)
- `eaad62f` fix bcrypt compatibility with passlib
- `3c11a91` lock dependency versions for stability

## Post-v0.1.0 Maintenance (2026-05-01)

### GitHub Pages Deployment Reliability

- Frontend production API base corrected so login/auth no longer call localhost in production.
- GitHub Pages SPA routing fixed for direct links and refreshes (including `/login`) by combining:
  - `404.html` redirect strategy
  - startup path restoration in app `index.html`
- `.nojekyll` and `404.html` placement corrected in `admin-app/public/` so files are emitted to deployed static output.
- Public asset path handling updated to use base-aware paths for manifest and static files.

### Event Image Delivery

- Added event images under `docs/images/` for GitHub Pages static hosting.
- Confirmed public URL convention for Featured Image fields:
  - `https://ksprinkle.github.io/sfa-admin-testing/images/<filename>.jpg`
- Confirmed `/docs/images/...` is not a valid public path and causes missing image behavior.

### Tester Feedback Capture

- Added global admin header Feedback button that opens:
  - `./event-creation-feedback-form.html`
- This gives test operators a direct in-app entry point to record event-creation feedback.

### Commit Trail (May 1 sequence)

- `082a35e` fix: use production API base for github pages login
- `4b6469f` fix: point github pages frontend to live api host
- `58c12eb` fix: add SPA 404 redirect and .nojekyll for github pages routing
- `c6b5a4b` fix: correct SPA redirect to encode full path including basename
- `6aa2128` fix: use BASE_URL for public assets and fix manifest icon paths
- `cbcc99d` fix: move 404.html and .nojekyll to public folder, add SPA redirect to index.html source
- `7cf926b` chore: add event images for github pages
- `a38fa34` Add feedback button
