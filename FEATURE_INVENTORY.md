# FEATURE_INVENTORY.md

> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `d07e1fe`

Part of the [AI Engineering Handbook](CLAUDE.md). This document maps what the application does to where each capability lives in code. For how the system is built, see [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md). For known gaps referenced below, see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md).

This is the doc most likely to need a small update alongside ordinary feature work — see `CLAUDE.md`'s Mandatory Engineering Rules.

## 1. Authentication & Authorization

**Feature Status:** Shipped. Two roles wired (`participant`, `admin`), each with its own least-privilege permission set — `admin` holds the operational `*.manage`/`admin.access` permissions, `participant` holds `participants.view_own` and `waivers.view_own` (Participant Portal identity foundation, added 2026-07-18; portal UI, including participant login, shipped in the slices that followed — see §14). See `ARCHITECTURE_OVERVIEW.md`'s Auth & Authorization section for the underlying mechanism. `POST /auth/register` (account creation) was hardened 2026-07-19 — validated JSON body (`UserCreate`, reused as-is, previously unused), case-insensitive duplicate detection via the new shared `api/utils/email_normalization.py` helper, a minimum password length, and per-IP rate limiting (`api/services/rate_limiting.py`) — but still has no calling UI in either app; that's tracked separately in `KNOWN_TECHNICAL_DEBT.md` as the next Hybrid Participant Account Model roadmap slice.

| Layer | Location |
|---|---|
| Backend router | `api/routers/auth.py` |
| Backend service/support | `api/dependencies.py`, `api/security.py`, `api/services/authorization.py`, `api/services/rate_limiting.py`, `api/utils/email_normalization.py` |
| Data model | `User` |
| Frontend | `admin-app/src/pages/Login.jsx`, `admin-app/src/api/auth.js` |

## 2. Event Management

**Feature Status:** Shipped, including auto-publish/auto-archive scheduling.

| Layer | Location |
|---|---|
| Backend routers | `api/routers/events.py` (public), `api/routers/admin_events.py`, `api/routers/admin_event_templates.py` |
| Backend service/support | `api/crud/events.py`, `api/utils/event_builder.py`, `event_counts.py`, `schedule_rules.py`, `slug.py`; public participant self-registration (`POST /events/{slug}/participants` and the canonical `POST /public/events/{slug}/register`) shares its event-lookup/capacity/waitlist logic via `api/services/public_registration.py` |
| Data model | `Event`, `EventTemplate`, `EventOperations` |
| Frontend | `admin-app/src/pages/Events.jsx`, `CreateEvent.jsx`, `EditEvent.jsx`, `EventDetail.jsx`, `EventTemplates.jsx`; `admin-app/src/api/events.js` |

## 3. Participant Management

**Feature Status:** Shipped. Includes waitlist promotion, soft-delete with an audit trail, and CSV export of the removal log.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_participants.py` |
| Backend service/support | `api/crud/participants.py` |
| Data model | `Participant`, `ParticipantRemovalLog` |
| Frontend | `admin-app/src/pages/Participants.jsx`; `components/ParticipantForm.jsx`, `ParticipantTable.jsx`, `ParticipantActionsDropdown.jsx` |

## 4. Volunteer Management

**Feature Status:** Shipped. Two related but distinct volunteer representations exist side by side — `Participant(role="volunteer")` for event-day signup/roster, and the `VolunteerProfile`/`VolunteerAvailability`/`VolunteerAssignment` set for the broader volunteer lifecycle. See `ARCHITECTURE_OVERVIEW.md`'s Known Architectural Quirks and `KNOWN_TECHNICAL_DEBT.md` for status.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_volunteers.py` |
| Backend service | `api/services/volunteer_lifecycle.py`, `volunteer_dashboard_projection.py` |
| Data model | `VolunteerProfile`, `VolunteerAvailability`, `VolunteerAssignment`; also `Participant(role="volunteer")` |
| Frontend | `admin-app/src/pages/VolunteerDashboard.jsx` |

## 5. Session Assignment

**Feature Status:** Shipped. Includes a capacity-aware recommendation/evaluation service and a drag-and-drop "Fast Assign" flow.

| Layer | Location |
|---|---|
| Backend router | Assignment endpoints in `api/routers/admin_participants.py` |
| Backend service | `api/services/session_service.py`, `session_recommender.py`, `assignment_evaluator.py`, `session_projection.py` |
| Data model | `Session` |
| Frontend | `admin-app/src/pages/FastAssign.jsx` (`@dnd-kit`) |

## 6. Check-in Operations

**Feature Status:** Shipped. Live-updates connected admin clients via the WebSocket broadcast channel on every check-in mutation (see `ARCHITECTURE_OVERVIEW.md`).

| Layer | Location |
|---|---|
| Backend router | Check-in endpoints in `api/routers/admin_participants.py`; `api/ws_manager.py` |
| Data model | `Participant` (check-in fields) |
| Frontend | `admin-app/src/pages/CheckIn.jsx` |

## 7. Waiver Verification

**Feature Status:** Shipped. Includes an explicit signing-lifecycle state machine and immutable PDF archival/provenance. Signing tokens (`create_signing_token()` in `waiver_signing.py`) now have two callers, both going through the identical function: an admin issuing one manually (`POST /admin`-gated `/waivers/create-token`, `actor_user_id` set to the admin), and — since 2026-07-18 — the canonical public registration flow issuing one automatically when a registration completes and an active `WaiverTemplate` exists (`actor_user_id=None`, see §13/§14). No second token-issuance path was created.

| Layer | Location |
|---|---|
| Backend router | `api/routers/waivers.py` |
| Backend service | `api/services/waiver_lifecycle.py`, `waiver_signing.py`, `waiver_pdf_archive.py`, `waiver_reporting.py`, `waiver_template_lifecycle.py`, `waiver_template_provenance.py`; auto-issuance orchestration lives in `api/services/public_onboarding.py` (§14), not here |
| Data model | `ParticipantWaiver`, `WaiverAuditEvent`, `WaiverSigningToken`, `WaiverPdfArtifact`, `WaiverDelivery`, `WaiverTemplate` |
| Frontend | `admin-app/src/pages/WaiverTemplates.jsx`, `admin-app/src/api/waiverTemplates.js`; public e-signing flow served as a static page, `admin-app/public/waiver-signing.html` (not part of the React SPA) — reached either from an admin-sent delivery link or, automatically, from `PortalRegister.jsx` (§14) |

## 8. Communications & Reminders

**Feature Status:** Shipped. Delivery reliability (retries, circuit breaking, failover) is handled by the Reliability & Telemetry subsystem described in `ARCHITECTURE_OVERVIEW.md`, not within this feature area's own code. The message lifecycle is complete: create, view, edit, and delete are all supported for messages in `ready` status; `dispatched` messages are immutable.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_communications.py` |
| Backend service | `api/services/communications_platform.py`, `communication_delivery.py`, `notification_delivery.py`, `notification_pipeline.py`, `reminder_scheduling.py`, `reminder_execution.py`, `reminders.py`, `message_template_rendering.py`, `email_delivery.py` |
| Data model | `CommunicationTemplate`, `CommunicationMessage`, `CommunicationDelivery`, `MessageTemplate`/`MessageTemplateVersion`, `ReminderDefinition`, `ReminderExecutionQueue`, `ReminderAuditEvent`, `NotificationDeliveryAttempt`/`NotificationDeliveryEvent` |
| Frontend | `admin-app/src/pages/Communications.jsx`, `components/communications/MessageComposerModal.jsx`, `components/communications/MessageDetailModal.jsx`, `admin-app/src/api/communications.js` |

## 9. Executive Dashboards & Operational Telemetry

**Feature Status:** Shipped. Dashboards are read-only projections over telemetry data; they hold no persisted state of their own (see `ARCHITECTURE_OVERVIEW.md`).

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_dashboard.py`, `admin_analytics.py`, `notification_read_state.py` |
| Backend service | `api/services/dashboard_service.py`, `dashboard_registry.py`, `dashboard_metrics_aggregator.py`, `dashboard_diagnostics.py`, `executive_analytics_projection.py`, `telemetry_store.py`, `notification_read_state.py` |
| Data model | `TelemetryRecord`; `NotificationReadState` (read/unread sync only — see below) |
| Frontend | `admin-app/src/pages/ExecutiveDashboard.jsx`; `components/NotificationCenter.jsx` (client-side aggregation in `App.jsx` over telemetry, messaging, delivery, and — as of the audit-events slice — admin audit events; see §10). Polling cadence is its own preference (`sfa.notificationCenterRefreshIntervalMs`, configurable from the panel), independent of the Dashboard/Executive Dashboard refresh settings — it only borrows their stored interval as a one-time fallback for users who haven't set the dedicated preference yet. In addition to interval polling, `App.jsx` opens a `/ws/updates` connection (the same channel and `{"type": ...}` envelope convention `admin_participants.py` already uses for `participant_update`) and refetches immediately on a `{"type": "audit_event"}` ping, which `record_admin_audit_event` (`api/services/admin_audit.py`) broadcasts for the same notable domain/action allowlist as the notification rules — a best-effort live nudge on top of, not a replacement for, the interval poll. See `KNOWN_TECHNICAL_DEBT.md` for a known timing edge case in that broadcast. Notifications themselves stay fully computed/client-aggregated — nothing about a notification's content is persisted — but *read state* now syncs across browsers/devices per user via `GET/POST /api/notifications/read-state`, keyed by each notification's own opaque `item.id` string (e.g. `audit:<uuid>`) as `NotificationReadState.notification_key`. `localStorage` (`sfa.notificationCenterReadIds`) remains the immediate, offline-tolerant source of truth for the UI; the server is merged in (set union, never destructive) on login and pushed to (best-effort) on every mark-read action, including a one-time reconciliation push of any pre-existing local-only read marks the server hasn't seen yet. |

## 10. Administrative Audit, Permissions & Automation

**Feature Status:** Shipped. Audit logging, permissions management, and workflow automation all have dedicated frontends. Permissions management here means role assignment (`participant`/`admin`) via `api/services/authorization.py`'s hardcoded role→permission matrix — there is no persisted per-permission or custom-role data model, and building one is out of scope for the current UI. The workflow automation frontend (`AutomationManagement.jsx`) covers workflow definition browsing, enable/disable toggling, manual execution with confirmation, and run history — all against the existing `AutomationWorkflow`/`AutomationRun` persistence and `automation_engine.py` harness. Only `trigger_type=manual` actually runs anything; `scheduled`/`event` are stored metadata with no scheduler or event listener wired up, and the UI labels them "Not active" rather than implying they run. The `api/automation/` subpackage (policy evaluation and remediation planning) exists only as compiled bytecode in the working tree with no `.py` source — its current runtime status is unconfirmed. See `ARCHITECTURE_OVERVIEW.md`'s Known Architectural Quirks and `KNOWN_TECHNICAL_DEBT.md`.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_audit.py`, `admin_permissions.py`, `admin_automation.py`; user/role management lives in `api/routers/auth.py` |
| Backend service | `api/services/admin_audit.py`, `authorization.py`, `automation_engine.py`; `api/automation/` (source not present, see above) |
| Data model | `AdminAuditEvent`, `EventActivityLog`, `AutomationWorkflow`, `AutomationRun`; role lives on `User.role` |
| Frontend | `admin-app/src/pages/AuditLog.jsx`, `admin-app/src/api/adminAudit.js`; `admin-app/src/pages/PermissionsManagement.jsx`, `admin-app/src/api/permissions.js`; `admin-app/src/pages/AutomationManagement.jsx`, `admin-app/src/api/automation.js`; `GET /admin/audit/events` is also reused by `components/NotificationCenter.jsx` (via `App.jsx`) to surface a curated subset of audit events (permission, participant, event-operations, communications, automation, and volunteer domains) as notifications — see §9 |

## 11. Feedback

**Feature Status:** Shipped. The `beta_uat` form covers the original login/navigation and core-event-operations tasks plus five later additions: Executive Dashboard, Search & Keyboard Navigation, Event Operations, Communications Center, and Overall Experience. As of 2026-07-17 it also covers the four most recently shipped admin features — Admin Audit Log Viewer, Communications Center (Detailed), Permissions Management, and Automation Management — plus a dedicated Overall Administration Experience section, added without any schema/API change (responses are stored as a single JSON blob per `Feedback.responses`, so new question keys require no migration). A Notification Center section (5 tasks covering discovery, understanding notifications, the auto-refresh preference, live updates, and read/unread state — see §9) was added the same way, ahead of Overall Administration Experience. `admin-app/src/pages/FeedbackReview.jsx`'s `FEEDBACK_SCHEMAS.beta_uat` map was extended in step so the new sections render and summarize like the existing ones.

| Layer | Location |
|---|---|
| Backend router | `api/routers/feedback.py` |
| Data model | `Feedback` |
| Frontend | `admin-app/src/pages/FeedbackReview.jsx`, `admin-app/src/api/feedback.js`; static intake forms `admin-app/public/beta-uat-feedback-form.html`, `event-creation-feedback-form.html` |

## 12. Event Operations Timeline

**Feature Status:** Shipped (v1). Chronological, per-event feed of participant check-ins, volunteer check-ins, session assignments, waitlist promotions, and waiver verifications, shown on Event Detail with auto-refresh. Extensible by design — adding a new event type is additive (see `api/services/event_operations_timeline.py`), no refactor of existing entries required.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_participants.py` (`GET /admin/participants/events/{event_id}/operations-timeline`) |
| Backend service | `api/services/event_operations_timeline.py` |
| Data model | Derived from `Participant`, `ParticipantWaiver`, and `AdminAuditEvent` — no new tables |
| Frontend | `admin-app/src/components/OperationsTimeline.jsx`, mounted on `admin-app/src/pages/EventDetail.jsx` |

## 13. Participant Identity (Portal Foundation)

**Feature Status:** Foundation only, shipped 2026-07-18. Establishes the identity/authorization groundwork for a future Participant Registration Portal — no portal UI, no "my registrations" listing, no automated waiver issuance, and no family/guardian accounts exist yet; those are deferred to later slices. `Participant.user_id` (nullable) links a per-event roster row to the participant-role `User` account that self-registered it. The two public registration endpoints (§2) set it automatically — via `api/services/public_registration.py::register_public_participant()` — only when the caller is authenticated as `participant`; anonymous calls and calls made with any other role's token leave it null. A single ownership-scoped read endpoint (`GET /api/participants/{participant_id}`, gated by the new `participants.view_own` permission) proves the scoping model end-to-end: it 404s (not 403, to avoid leaking whether a given id exists) for records the caller doesn't own, including unclaimed (`user_id IS NULL`) rows, and 403s for roles that lack the permission entirely (e.g. `admin`, which uses its own dedicated admin participant endpoints instead).

| Layer | Location |
|---|---|
| Backend router | `api/routers/participant_self.py` |
| Backend service | `api/services/participant_identity.py`; `api/services/public_registration.py` (registration-time linkage); `api/services/authorization.py` (`participants.view_own`, `waivers.view_own` — the latter defined and granted but not yet consumed by any endpoint) |
| Data model | `Participant.user_id` → `User.id` (migration `a5f2c8e1b9d3`) |
| Frontend | None by design — see Feature Status |

## 14. Participant Portal (Public React Shell)

**Feature Status:** Partially shipped. A public, unauthenticated route group (`/portal`, `/portal/events`, `/portal/register`, `/portal/my-registrations`, `/portal/login`) with its own layout, branding, and navigation, separate from the admin SPA shell (structure, registration, and automatic waiver continuation shipped 2026-07-18; "My Registrations" shipped 2026-07-19; participant login shipped 2026-07-19) — account creation, profile management, and family/guardian accounts still don't exist; those, plus anything beyond a read-only registrations view (registration editing, cancellation, badges, progress tracking, timeline/history), are deferred to later slices — see `KNOWN_TECHNICAL_DEBT.md` for the account-creation gap specifically. `App()` (`admin-app/src/App.jsx`) checks `location.pathname` for the `/portal` prefix and, if matched, renders an entirely separate `<Routes>` tree wrapped in `PortalLayout` instead of the admin tree wrapped in `AppLayout` — the two trees never interact, so this is reachable with no token and cannot affect (or be affected by) the existing `if (!token) redirect to /login` admin gating. `PortalEvents` consumes the existing public `GET /api/events` endpoint (§2) for display only.

**Participant login (`/portal/login`):** `PortalLogin.jsx` is a real sign-in form, reusing the existing `POST /api/auth/login` endpoint as-is (no backend change — login was already role-agnostic) via `api/portalAuth.js`. Session state (`portal.token`/`portal.profile` in `localStorage`, plus a `portal-auth:changed` window event) is completely isolated from the admin shell's own `token`/`auth.profile`/`auth:changed` — a participant session can never make the admin shell appear signed in, or vice versa (see `ARCHITECTURE_OVERVIEW.md`'s Frontend Architecture section). `PortalLayout`'s nav reflects sign-in state live (email + Sign Out button replacing the Login/Create Account links) without a full page reload. Deliberately narrow: sign-in and sign-out only — no password reset or MFA.

**Account creation (`/portal/create-account`, shipped 2026-07-19 — Hybrid Participant Account Model roadmap, Slice B):** `PortalCreateAccount.jsx` reuses the Slice A-hardened `POST /auth/register` (via `api/portalAuth.js::createParticipantAccount()`) and immediately chains into the existing, unmodified `loginParticipant()` (`registerAndSignIn()`) — account creation, sign-in, and redirect to `/portal/my-registrations` in one flow, no new session logic. A real visitor can now obtain a participant account end-to-end for the first time. Deliberately excludes email verification and registration-claiming — both remain unbuilt, per the architecture review's roadmap (Slices C–E).

`PortalRegister` is a full React recreation of the static `admin-app/public/participant-registration.html` page: open-events list, slug-based lookup (including a `?slug=` deep link, e.g. from `PortalEvents`), event detail with a participant-registration-open/closed indicator, and the registration form itself, all against the same canonical backend flow the legacy `/events/{slug}/participants` endpoint shares its core logic with (`POST /api/public/events/{slug}/register`, see §2). One deliberate improvement over the static page: the success message distinguishes a waitlisted registration from a confirmed one — the static page shows the same generic message either way (and still works unmodified today: it never reads the response body on success, so the response-shape change below doesn't affect it). The static page is intentionally left in place until this React page has been fully validated in production — see `KNOWN_TECHNICAL_DEBT.md` for the retirement note.

**Automatic waiver continuation:** `POST /api/public/events/{slug}/register` now returns `{participant, waiver: {required, token, signing_path, expires_at}}` instead of a flat participant object — orchestrated by `api/services/public_onboarding.py::complete_public_registration()` (see `ARCHITECTURE_OVERVIEW.md`'s Backend Architecture section for the full description; also touches §7). When `waiver.required` and `waiver.token` are present, `PortalRegister.jsx` redirects the browser straight into the existing static `waiver-signing.html` page (`?token=` query param) instead of stopping at a confirmation message; when no active waiver template exists, the prior confirmation-only behavior is unchanged. This applies only to the canonical endpoint — the legacy `/events/{slug}/participants` endpoint's response shape and behavior are both unchanged, by design (see §2).

**"My Registrations" (`/portal/my-registrations`):** a read-only list of the caller's own registrations and waiver status — no editing, cancellation, badges, progress tracking, or timeline/history. Backed by a new endpoint, `GET /api/participants/mine` (`api/routers/participant_self.py`, registered *before* the existing `GET /participants/{participant_id}` route so the literal path segment `mine` isn't swallowed as an invalid UUID path parameter), reusing the same `participants.view_own` permission and the same ownership rule (`Participant.user_id == current_user.id`) as that single-record endpoint — `api/services/participant_identity.py::list_own_registrations()` is the list-shaped sibling of `get_own_participant_or_404()`, both scoped identically, neither introducing new authorization logic. Response fields are deliberately narrow (event name/date/location, `is_waitlisted`, `checked_in`, a derived `waiver_status` of `not_required`/`pending`/`signed`) — no admin-only fields (notes, removal metadata, waiver-verifier identity). `waiver_status` reuses the existing `waiver_lifecycle.derive_participant_waiver_status()` helper (the same one the admin participant list already uses) rather than reimplementing waiver-state interpretation. Now reachable end-to-end by a real visitor: sign in via `/portal/login`, land directly on this page.

| Layer | Location |
|---|---|
| Backend router | `GET /api/participants/mine` added to `api/routers/participant_self.py` (existing router, existing permission dependency) |
| Backend service | `api/services/public_onboarding.py` (waiver continuation); `api/services/participant_identity.py::list_own_registrations()` (My Registrations, new) |
| Frontend | `admin-app/src/components/PortalLayout.jsx`; `admin-app/src/pages/PortalHome.jsx`, `PortalEvents.jsx`, `PortalRegister.jsx`, `PortalMyRegistrations.jsx`, `PortalLogin.jsx`, `PortalCreateAccount.jsx`; `admin-app/src/api/portal.js`, `portalAuth.js`; `admin-app/src/utils/portalFormat.js`; routing in `admin-app/src/App.jsx` |

## Reporting

Reporting is delivered inline within the feature areas that own the underlying data, rather than as a separate subsystem: participant removal history (CSV export, §3), waiver delivery history and metrics (CSV export and metrics endpoints, §7), and executive/operational metrics (§9). There is no standalone reporting module.
