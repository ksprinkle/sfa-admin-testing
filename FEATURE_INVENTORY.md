# FEATURE_INVENTORY.md

> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `d07e1fe`

Part of the [AI Engineering Handbook](CLAUDE.md). This document maps what the application does to where each capability lives in code. For how the system is built, see [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md). For known gaps referenced below, see [`KNOWN_TECHNICAL_DEBT.md`](KNOWN_TECHNICAL_DEBT.md).

This is the doc most likely to need a small update alongside ordinary feature work — see `CLAUDE.md`'s Mandatory Engineering Rules.

## 1. Authentication & Authorization

**Feature Status:** Shipped. Two roles wired (`participant`, `admin`); additional permission constants exist in the authorization map but are not yet assigned to any role beyond `admin`. See `ARCHITECTURE_OVERVIEW.md`'s Auth & Authorization section for the underlying mechanism.

| Layer | Location |
|---|---|
| Backend router | `api/routers/auth.py` |
| Backend service/support | `api/dependencies.py`, `api/security.py`, `api/services/authorization.py` |
| Data model | `User` |
| Frontend | `admin-app/src/pages/Login.jsx`, `admin-app/src/api/auth.js` |

## 2. Event Management

**Feature Status:** Shipped, including auto-publish/auto-archive scheduling.

| Layer | Location |
|---|---|
| Backend routers | `api/routers/events.py` (public), `api/routers/admin_events.py`, `api/routers/admin_event_templates.py` |
| Backend service/support | `api/crud/events.py`, `api/utils/event_builder.py`, `event_counts.py`, `schedule_rules.py`, `slug.py` |
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

**Feature Status:** Shipped. Includes an explicit signing-lifecycle state machine and immutable PDF archival/provenance.

| Layer | Location |
|---|---|
| Backend router | `api/routers/waivers.py` |
| Backend service | `api/services/waiver_lifecycle.py`, `waiver_signing.py`, `waiver_pdf_archive.py`, `waiver_reporting.py`, `waiver_template_lifecycle.py`, `waiver_template_provenance.py` |
| Data model | `ParticipantWaiver`, `WaiverAuditEvent`, `WaiverSigningToken`, `WaiverPdfArtifact`, `WaiverDelivery`, `WaiverTemplate` |
| Frontend | `admin-app/src/pages/WaiverTemplates.jsx`, `admin-app/src/api/waiverTemplates.js`; public e-signing flow served as a static page, `admin-app/public/waiver-signing.html` (not part of the React SPA) |

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

## Reporting

Reporting is delivered inline within the feature areas that own the underlying data, rather than as a separate subsystem: participant removal history (CSV export, §3), waiver delivery history and metrics (CSV export and metrics endpoints, §7), and executive/operational metrics (§9). There is no standalone reporting module.
