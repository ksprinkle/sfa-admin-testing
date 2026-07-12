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

**Feature Status:** Shipped. Delivery reliability (retries, circuit breaking, failover) is handled by the Reliability & Telemetry subsystem described in `ARCHITECTURE_OVERVIEW.md`, not within this feature area's own code.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_communications.py` |
| Backend service | `api/services/communications_platform.py`, `communication_delivery.py`, `notification_delivery.py`, `notification_pipeline.py`, `reminder_scheduling.py`, `reminder_execution.py`, `reminders.py`, `message_template_rendering.py`, `email_delivery.py` |
| Data model | `CommunicationTemplate`, `CommunicationMessage`, `CommunicationDelivery`, `MessageTemplate`/`MessageTemplateVersion`, `ReminderDefinition`, `ReminderExecutionQueue`, `ReminderAuditEvent`, `NotificationDeliveryAttempt`/`NotificationDeliveryEvent` |
| Frontend | `admin-app/src/pages/Communications.jsx`, `components/communications/MessageComposerModal.jsx`, `admin-app/src/api/communications.js` |

## 9. Executive Dashboards & Operational Telemetry

**Feature Status:** Shipped. Dashboards are read-only projections over telemetry data; they hold no persisted state of their own (see `ARCHITECTURE_OVERVIEW.md`).

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_dashboard.py`, `admin_analytics.py` |
| Backend service | `api/services/dashboard_service.py`, `dashboard_registry.py`, `dashboard_metrics_aggregator.py`, `dashboard_diagnostics.py`, `executive_analytics_projection.py`, `telemetry_store.py` |
| Data model | `TelemetryRecord` |
| Frontend | `admin-app/src/pages/ExecutiveDashboard.jsx`; `components/NotificationCenter.jsx` (telemetry-driven) |

## 10. Administrative Audit, Permissions & Automation

**Feature Status:** Partial. Audit logging and permissions management are shipped. The workflow automation engine (`AutomationWorkflow`/`AutomationRun` persistence, `automation_engine.py`) is present, but the `api/automation/` subpackage (policy evaluation and remediation planning) exists only as compiled bytecode in the working tree with no `.py` source — its current runtime status is unconfirmed. See `ARCHITECTURE_OVERVIEW.md`'s Known Architectural Quirks and `KNOWN_TECHNICAL_DEBT.md`. No dedicated frontend page currently exists for this feature area.

| Layer | Location |
|---|---|
| Backend router | `api/routers/admin_audit.py`, `admin_permissions.py`, `admin_automation.py` |
| Backend service | `api/services/admin_audit.py`, `automation_engine.py`; `api/automation/` (source not present, see above) |
| Data model | `AdminAuditEvent`, `EventActivityLog`, `AutomationWorkflow`, `AutomationRun` |
| Frontend | None identified |

## 11. Feedback

**Feature Status:** Shipped.

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
