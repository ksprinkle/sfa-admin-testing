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
