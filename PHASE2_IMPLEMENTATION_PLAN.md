# Phase 2 Implementation Plan

Date: 2026-06-13
Baseline tag: v1.0.0
Baseline commit: 666b5a4
Branch policy: master only unless explicitly redirected

## Source of truth and guardrails

- Implementation truth: PROJECT_SYNC_BRIEF.md
- Planning input only: ROADMAP_INTENT.md (unless commit-backed in brief)
- Preserve approved behavior from v1.0.0 baseline
- Preserve stash@{0} until production acceptance
- No redesign of approved workflows during Phase 2

## Milestone tracking

### Phase 2.1 - Waiver Domain Model and Lifecycle Engine

Objective:
- Establish digital waiver domain foundations without changing existing participant workflows or UI behavior.

Deliverables:
- [x] Define Waiver domain entity/model
- [x] Define waiver lifecycle statuses: draft, sent, viewed, signed, archived, superseded
- [x] Define versioning strategy (revisioned waiver metadata on the waiver record)
- [x] Define audit event structure
- [x] Define derived participant waiver status
- [x] Add database migration for lifecycle and audit schema
- [x] Document architecture updates

Explicit non-goals:
- No PDF generation
- No Email/SMS delivery
- No public signature capture UI
- No participant workflow redesign

Planned commit:
- feat(waiver): add waiver domain model and lifecycle

Validation checklist:
- [ ] Diagnostics pass
- [ ] Build/compile checks pass
- [ ] Single scoped commit created
- [ ] Working tree reviewed after commit
- [ ] stash@{0} still present

### Phase 2.2 - Secure Signing Workflow

Planned deliverables:
- [x] Secure token generation
- [x] Public signing endpoint
- [x] Expiration handling
- [x] Validation
- [x] Replay protection

Planned commit:
- feat(waiver): add secure signing workflow

Validation checklist:
- [ ] Diagnostics pass
- [ ] Compile/build checks pass
- [ ] Single scoped commit created
- [ ] Working tree reviewed after commit
- [ ] stash@{0} still present

### Phase 2.3 - Mobile Signing UI

Planned deliverables:
- [x] Responsive signing page
- [x] Signature canvas
- [x] Accessibility improvements
- [x] Touch and stylus support
- [x] Mouse support
- [x] Client-side validation
- [x] Loading and error states
- [x] Local draft preservation (temporary client-only state)

Planned commit:
- feat(waiver): implement responsive signing interface

Validation checklist:
- [ ] Diagnostics pass
- [ ] Build/compile checks pass
- [ ] Single scoped commit created
- [ ] Working tree reviewed after commit
- [ ] stash@{0} still present

### Phase 2.4 - PDF Generation

Planned deliverables:
- [x] Immutable PDF generation
- [x] Storage and retrieval
- [x] Hash or checksum support

Planned commit:
- feat(waiver): generate and archive signed waiver PDFs

Validation checklist:
- [ ] Diagnostics pass
- [ ] Build/compile checks pass
- [ ] Single scoped commit created
- [ ] Working tree reviewed after commit
- [ ] stash@{0} still present

### Phase 2.5 - Email and SMS Delivery

Planned deliverables:
- Email delivery
- SMS delivery
- Resend functionality
- Delivery status tracking

Planned commit:
- feat(waiver): add waiver delivery services

### Phase 2.6 - Reporting and Dashboard Integration

Planned deliverables:
- Dashboard status indicators
- Reporting hooks
- Analytics events

Planned commit:
- feat(waiver): integrate waiver status into administration

## Session gates

Before each coding session:
- Verify repository state
- Verify current HEAD and branch
- Verify stash state

After each milestone:
- Run diagnostics
- Run build/compile checks when appropriate
- Commit one scoped change set
- Verify remaining local changes
- Verify preserved stash remains untouched
