# Architecture Decisions

This document records architectural and release-governance decisions that are binding through v1.0.0.

## ADR-001: Release Baseline and Tagging Rule
Date: 2026-06-08
Status: Accepted

Decision:
- Define release baseline as current HEAD at deployment start.
- Deploy that commit.
- Verify deployment against that commit.
- Tag v1.0.0-rc2 only after deployment verification.
- If verification passes, tag v1.0.0 on the exact same commit.

Rationale:
- Production tags must point to the exact deployed and verified commit for auditability and rollback confidence.

## ADR-002: Waiver as Separate Entity
Date: 2026-06-08
Status: Accepted

Decision:
- Model waiver as a separate entity (participant_waivers) with a 1:1 relation to participant.
- Keep participant waiver booleans for backward compatibility during transition.

Rationale:
- Waiver is a business object with its own lifecycle and metadata.
- Backward compatibility avoids destabilizing current release workflows.

## ADR-003: Check-In Gate Rule
Date: 2026-06-08
Status: Accepted

Decision:
- Participant check-in requires a verified waiver.

Rationale:
- Aligns with operational safety/legal requirement for event-day flow.

## ADR-004: Waiver Audit Fields
Date: 2026-06-08
Status: Accepted

Decision:
- Track waiver source values as:
  - `digital`
  - `paper`
  - `staff_override`
- Track audit metadata:
  - verification timestamp
  - verifying user
  - optional notes
  - `waiver_version` (legal form/version accepted)

Rationale:
- Removes ambiguity and provides operational/legal traceability.
- `waiver_version` enables future legal text changes without schema redesign.

## ADR-005: Scope Freeze Through v1.0.0
Date: 2026-06-08
Status: Accepted

Decision:
- Declare feature freeze through v1.0.0.
- Only the following commit categories are allowed before v1.0.0:
  - deployment fixes
  - bug fixes
  - documentation
  - critical release issues

Allowed before v1.0.0:
- Bug fixes
- Deployment fixes
- Documentation
- Minor UI polish

Not allowed before v1.0.0:
- Digital signature implementation
- Email workflows
- PDF generation
- Additional waiver states
- Schema redesign

Rationale:
- Protect release stability and keep validation surface bounded.

## Immutable v1.0 Architectural Decisions
- Authentication architecture is locked.
- Deployment architecture is locked.
- Import architecture is locked.
- Waiver is a separate entity.
- Participant remains backward compatible.
- Check-in requires verified waiver.
- waiver_source values are locked to:
  - digital
  - paper
  - staff_override
- waiver_version records the legal form accepted.

## Post-v1.0 Planned Enhancements (Not Release Blockers)
- Digital signature capture
- Email and SMS waiver delivery
- PDF generation and storage
- Additional waiver lifecycle states
- Enhanced reporting

## Post-1.0 Roadmap Priorities
1. Digital Waiver System
- Parent link
- Mobile signing
- Automatic verification
- PDF generation
- Full audit trail

2. Registration Communications
- Email
- SMS
- Reminder workflow

3. Volunteer Enhancements
- Assignment improvements
- Capacity planning
- Reporting

## ADR-006: Phase 2.1 Waiver Lifecycle Engine
Date: 2026-06-13
Status: Accepted

Decision:
- Expand waiver domain status lifecycle to:
  - `draft`
  - `sent`
  - `viewed`
  - `signed`
  - `archived`
  - `superseded`
- Preserve backward compatibility for legacy statuses by mapping:
  - `pending` -> `draft`
  - `verified` -> `signed`
- Keep existing participant waiver booleans in place for stable check-in and participant workflows.

Rationale:
- Enables staged digital-waiver capabilities without breaking approved event-day behavior.

## ADR-007: Phase 2.1 Waiver Versioning and Audit Event Structure
Date: 2026-06-13
Status: Accepted

Decision:
- Keep one active waiver row per participant (current architecture) and track waiver revision metadata on the waiver record.
- Add lifecycle timestamps (`sent_at`, `viewed_at`, `signed_at`, `archived_at`, `superseded_at`) plus lifecycle update timestamp.
- Add `waiver_audit_events` table for immutable event records including:
  - event type
  - from status
  - to status
  - actor user id
  - source
  - JSON details payload
  - created timestamp
- Define derived participant waiver status from waiver entity first, then participant compatibility booleans.

Rationale:
- Establishes legal and operational traceability required for later secure signing, delivery, and reporting milestones.

## ADR-008: Phase 2.2 Tokenized Public Signing Access
Date: 2026-06-13
Status: Accepted

Decision:
- Public signing is token-only and does not expose internal waiver IDs.
- Signing tokens are cryptographically random, opaque, and stored server-side as hashes.
- Tokens include issued and expiration timestamps and are time-limited.
- Public access endpoints are limited to token-based GET/POST signing flow.

Rationale:
- Minimizes disclosure and enumeration risk while enabling no-auth guardian/participant signing.

## ADR-009: Phase 2.2 Replay and Expiration Behavior
Date: 2026-06-13
Status: Accepted

Decision:
- Completed signing submissions are idempotent: repeated submits with same token return signed result rather than creating duplicates.
- Expired tokens return deterministic user-facing response without internal details.
- Significant token/signing actions append waiver audit events (for example: TOKEN_CREATED, TOKEN_VIEWED, TOKEN_VALIDATED, SIGN_SUBMITTED, SIGN_COMPLETED, TOKEN_EXPIRED, INVALID_ACCESS).

Rationale:
- Provides predictable operator/user behavior, hardens security boundaries, and preserves an auditable history.

## ADR-010: Phase 2.4 Immutable Waiver PDF Artifacts
Date: 2026-06-13
Status: Accepted

Decision:
- Generate waiver PDFs only for completed signed waivers.
- Store each PDF as an immutable archived artifact referenced to waiver and revision metadata.
- Persist archive metadata including waiver id, participant id, waiver version/revision, storage path, generation timestamp, and SHA-256 hash.
- Expose admin-authorized retrieval endpoints without changing signing workflow behavior.

Rationale:
- Keeps database waiver record as canonical source while enabling verifiable immutable legal snapshots.

## ADR-011: Phase 2.5 Waiver Delivery Orchestration
Date: 2026-06-13
Status: Accepted

Decision:
- Track waiver delivery attempts in a dedicated delivery model separate from waiver records.
- Support email and SMS delivery methods with template rendering, resend attempts, and persisted status tracking.
- Treat delivery service as a consumer of existing signing token and waiver infrastructure.
- Keep waiver lifecycle and PDF archive logic unchanged during this phase.

Rationale:
- Enables retryable multi-channel delivery without mutating signed records and preserves clear audit history.

## ADR-012: Phase 2.6 Waiver Observability and Reporting
Date: 2026-06-13
Status: Accepted

Decision:
- Add admin-authorized waiver observability endpoints for metrics, analytics event aggregation, and delivery CSV export.
- Derive reporting metrics from existing waiver, token, delivery, and participant data models without introducing lifecycle or workflow mutations.
- Extend admin event summary payload with waiver and delivery counters for dashboard integration.
- Keep token signing, lifecycle transitions, PDF generation, and delivery orchestration behavior unchanged.

Rationale:
- Improves operational visibility for event readiness and follow-up actions while preserving previously approved business logic and security boundaries.

## ADR-013: Phase 4.2 Governance and Audit Infrastructure
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce `admin_audit_events` as the canonical cross-domain store for administrative governance events.
- Define a dedicated audit service interface for write and read operations:
  - `record_admin_audit_event(...)`
  - `list_admin_audit_events(...)`
- Expose admin-authorized read access via `GET /api/admin/audit/events` with scoped filters and pagination.
- Integrate existing admin role-change actions as first consumers so permission changes emit immutable governance events in the same transaction.
- Keep this phase scoped to audit infrastructure only; no permissions redesign, workflow automation, volunteer lifecycle, communications, or analytics expansion is included.

Rationale:
- Establishes canonical audit ownership before broader Phase 4 features rely on governance evidence.
- Prevents projection/reporting layers from becoming de facto audit systems of record.
- Enables later phases to consume a stable, centralized administrative audit stream without retrofitting.

## ADR-014: Phase 4.3 Permissions Architecture
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce a canonical authorization role and permission matrix in service-layer architecture (`api/services/authorization.py`).
- Keep current runtime role set stable (`admin`, `participant`) while formalizing permission contracts for admin operations.
- Refactor authorization dependency checks to consume permission decisions (`has_permission`) rather than hard-coded role comparisons.
- Add explicit admin introspection endpoints for permissions architecture:
  - `GET /api/admin/permissions/matrix`
  - `GET /api/admin/permissions/me`
- Keep permissions phase scope limited to architecture and enforcement primitives; no workflow automation, communications, volunteer lifecycle, or analytics expansion is included.

Rationale:
- Establishes a reusable authorization foundation before later Phase 4 capability expansion.
- Reduces authorization drift by defining one canonical matrix and one enforcement path.
- Preserves current behavior while enabling future fine-grained permissions without endpoint-by-endpoint rewrites.

## ADR-015: Phase 4.4 Workflow Automation Foundation
Date: 2026-06-14
Status: Accepted

Decision:
- Introduce canonical automation foundation entities:
  - `automation_workflows` (workflow registration and trigger metadata)
  - `automation_runs` (execution lifecycle records)
- Introduce a central automation engine service that provides:
  - workflow handler registration
  - workflow definition creation and enable/disable controls
  - execution model for workflow runs
- Keep automation phase scoped to framework primitives only; no reminder, messaging, volunteer, event-ops, or analytics workflows are implemented in this phase.
- Integrate automation APIs with canonical permissions and canonical audit infrastructure:
  - permissions gate: `automation.manage`
  - audit events on workflow create/enable changes and execution lifecycle
- Establish a default no-op handler (`system.noop`) to validate engine plumbing without introducing domain behavior.

Rationale:
- Provides an orchestration layer that reacts to canonical state without becoming a competing system of record.
- Ensures automation execution is permission-aware and auditable from first use.
- Preserves roadmap sequencing by creating extensible primitives before feature-specific automation workloads.
