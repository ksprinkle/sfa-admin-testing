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
