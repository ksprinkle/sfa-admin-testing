Roadmap Intent (Planning Only)
1) Session Metadata
Date: 2026-04-30
Planner source: ChatGPT
Planning horizon: 1 sprint (stabilization + pre-release hardening)
Requested by: Project owner
Related brief revision date: 2026-04-30
2) Current Assumptions
The system is functionally complete for live event use (sessions, waitlist, priority, check-in).
Offline-first behavior and queue retry logic are implemented and validated.
Cross-device sync via WebSocket + polling fallback is working.
Simulation testing has been completed and major issues resolved.
No-show timing rules are not yet finalized by client, so automation must remain configurable or manual.
System will be used in unreliable network environments (beach events).
3) Prioritized Roadmap (Top 3 First)
ITEM-001: Per-Row Sync State Indicators
Priority: P0
Why now:
Operators currently see queue status globally, but not which specific participants are pending sync. This creates ambiguity during offline or degraded conditions.
Scope:
Add per-participant visual indicators showing:
pending sync
synced
failed/retry state
Acceptance criteria:
 Each participant row shows a clear sync state indicator (icon or badge).
 Pending offline actions visibly mark affected participants immediately.
 Indicator clears automatically after successful sync.
 Failed sync (non-retryable) shows a distinct error state.
 Works consistently across:
Check-In page
Participants page
Event Detail page
Non-goals:
No full audit/history UI
No backend schema changes required
Dependencies:
Existing offline queue system
Existing optimistic UI updates
Risk level: Low
ITEM-002: Queue Conflict Resolution UX
Priority: P0
Why now:
Offline queue retry currently assumes success. Server-side rejects (e.g., participant removed, session full, invalid state) are not clearly surfaced to operators.
Scope:
Add operator-visible handling for failed queue replays.
Acceptance criteria:
 Failed queue items are surfaced in UI with clear explanation.
 User sees actionable message:
(e.g., “Participant no longer available”, “Session is full”)
 Failed items are removed or flagged (not silently retried forever).
 Optional retry button for recoverable errors.
 Queue banner reflects:
- pending
- failed
- retrying states
Non-goals:
No complex conflict resolution workflows
No automatic reassignment logic
Dependencies:
Backend error responses must be distinguishable (status codes/messages)
Risk level: Medium
ITEM-003: Automated Offline Queue Smoke Test Script
Priority: P1
Why now:
Your system now heavily relies on offline queue correctness. Manual testing works, but repeatability is needed before release.
Scope:
Create a lightweight automated test script or dev tool to simulate:
offline check-ins
reconnect
queue replay
Acceptance criteria:
 Script can simulate offline mode programmatically
 Script performs multiple queued actions
 Script restores connection and validates:
- queue cleared
- no duplicates
- no data loss
 Output logs clearly show pass/fail
Non-goals:
No full test framework integration required
No CI pipeline required (yet)
Dependencies:
Existing API endpoints
Dev environment
Risk level: Low
4) Constraints and Guardrails
Must preserve existing production behavior unless explicitly changed.
Must support mobile and desktop operator workflows.
Must avoid regressions in offline queue and sync behavior.
Must keep API contract changes documented before implementation.

Project-specific constraints:

No-show automation must remain disabled or configurable until client confirms timing rules.
System must remain fully usable in offline/degraded mode.
UI must remain fast and keyboard-driven for check-in workflows.
5) Open Questions
Q1: What is the approved no-show grace period before automatic replacement?
Q2: Should failed queue actions be auto-resolved (e.g., skip) or always require operator awareness?
Q3: Is audit/history tracking required for compliance or post-event review?
6) Copilot Implementation Intake

Implementation request

Use PROJECT_SYNC_BRIEF.md as implementation source of truth.
Treat this ROADMAP_INTENT.md as planning intent only.
Implement only ITEM IDs explicitly marked Approved for Build.
If assumptions conflict with code, report the mismatch and propose smallest safe path.
After implementation, update PROJECT_SYNC_BRIEF.md with commit-backed outcomes.

Approved for Build

✔ ITEM-001
✔ ITEM-002
 ITEM-003
7) Anti-Drift Checklist

Before starting code:

 Confirm selected ITEM IDs still match current priorities.
 Confirm acceptance criteria are testable and unambiguous.
 Confirm non-goals are explicit.
 Confirm dependencies are available.

After coding session:

 Mark delivered criteria with commit evidence in PROJECT_SYNC_BRIEF.md.
 Move unfinished criteria into next session plan.
 Record any scope changes or trade-offs.
8) Revision Log
Rev 1:
Date: 2026-04-26
Summary of planning changes:
Shifted focus from feature development → production hardening
Prioritized sync visibility and conflict handling
Deferred automation (no-show) pending client input
Reason:
System reached production-ready state after simulation

Rev 2:
Date: 2026-04-30
Summary of planning changes:
- Recorded completion of deployment hardening tasks (Render structure/rootDir/start command alignment).
- Captured backend import consistency and dependency-stability work as completed baseline.
- Shifted near-term focus from environment stabilization to operational confidence and post-deploy monitoring.
Reason:
Recent sessions prioritized deploy/runtime reliability and reproducible environments.

9) Phase 5 Roadmap Update

Canonical Baseline:
`PWA v5.9 baseline: Async Dispatch Architecture`

Completed:
- Phase 5.1 Reminder & Notification Architecture Foundation (committed)
- Phase 5.2 Reminder Execution Engine (committed)
- Phase 5.3 Notification Delivery Pipeline Foundation (committed)
- Phase 5.4 Message Template & Rendering Foundation (committed)
- Phase 5.5 Email Provider Foundation (committed)
- Phase 5.6 Provider Resolution Architecture (committed)
- Phase 5.7 Retry Strategy Abstraction (committed)
- Phase 5.8 Reminder Execution Pipeline Orchestration (committed)
- Phase 5.9 Async Dispatch Architecture (committed)

Approved for Build:
- Phase 6 (to be determined at next Planning Gate)

Roadmap Statuses:
- Reminder Architecture Foundation: Complete
- Reminder Execution Engine: Complete
- Notification Delivery Pipeline: Complete
- Communications Platform: In Progress through provider foundations
- Event Operations: Planned
- Executive Analytics: Planned
- Platform Integration: Deferred until upstream modules mature

Deferred Work Register:
- SMS provider implementation
- Push notification provider
- Campaign management
- Bulk messaging
- Advanced retry policies
- Delivery analytics
- Event operations enhancements
- Volunteer workflow improvements
- Administrative automation
- Executive reporting enhancements
- Executive dashboards
- Cross-module communication workflows
- Cross-module integration
- Workflow optimization

Completed and removed from deferred work register:
- Email provider implementation
- Message templating

Next logical milestone:
- Begin Phase 6 Architecture & Roadmap Planning Gate. No implementation until approval.

10) Phase 6 Planning Baseline

Status:
- Phase 6 specification and design baseline established.
- Planning closeout complete.
- Increment 1 (Execution Pipeline Foundation) closed.
- Canonical baseline established: `v1.12.0-phase6-increment1-execution-pipeline`.
- Increment 2 (Execution Outcome Classification) implemented and approved for closeout.
- Baseline advancement recommended: `v1.13.0-phase6-increment2-outcome-classification`.
- Increment 3 candidate comparison complete.
- Increment 3 selected candidate: Retry Strategy Pipeline Integration (design packet pending).
- Increment 3 design-review packet drafted.
- Increment 3 design review approved.
- Increment 3 implementation planning review approved.
- Increment 3 implementation authorization approved.
- Increment 3 closeout approved.
- Increment 3 closed.
- Baseline advancement recommended: `v1.14.0-phase6-increment3-retry-decision-integration`.
- Increment 4 candidate comparison complete.
- Increment 4 selected candidate: Retry Execution Orchestration (design packet pending).
- Increment 4 design-review packet drafted.
- Increment 4 design review approved.
- Increment 4 implementation-planning packet drafted.
- Increment 4 implementation planning review approved.
- Increment 4 implementation authorization approved.
- Increment 4 implementation completed (closeout review pending).
- Increment 4 closeout approved.
- Increment 4 closed.
- Baseline advancement recommended: `v1.15.0-phase6-increment4-retry-execution-orchestration`.
- Increment 5 candidate comparison complete.
- Increment 5 selected candidate: Provider Failover Boundary (design packet pending).
- Increment 5 design-review packet drafted.
- Increment 5 design review approved.
- Increment 5 implementation-planning packet drafted.
- Increment 5 implementation-planning review approved.
- Increment 5 implementation authorization approved.
- Increment 5 implementation completed.
- Increment 5 closeout approved.
- Increment 5 closed.
- Increment 6 candidate comparison complete.
- Increment 6 selected candidate: Circuit Breaker Boundary (design packet pending).
- Increment 6 design-review packet drafted.
- Increment 6 design review approved.
- Increment 6 implementation-planning packet drafted.
- Increment 6 implementation-planning review approved.
- Increment 6 implementation authorization approved.
- Increment 6 implementation completed (closeout review pending).
- Increment 6 closeout approved.
- Increment 6 closed.

Authoritative planning document:
- `PHASE6_SPECIFICATION_AND_DESIGN.md`

Next executable work item:
- Phase 6 Increment 7: Design Review (candidate and packet pending)
	- No Increment 6 implementation until design review, planning review, and explicit authorization are approved.

Scope reminder:
- Phase 6 proceeds incrementally: one reviewed and validated increment at a time.

Next logical milestone after Increment 1 closeout:
- Start Phase 6 Increment 7 candidate comparison and design-review packet preparation.

Design-review packet status:
- Approved
- Implementation planning pending
- Implementation not authorized

Design-review packet status:
- Approved
- Implementation planning packet drafted
- Implementation planning review approved
- Implementation authorized and increment closed

🧠 Why This Roadmap Is Correct (quick context)

This roadmap does not add new features.

It focuses on:

Eliminating ambiguity (ITEM-001)
Handling failure gracefully (ITEM-002)
Ensuring reliability at scale (ITEM-003)

👉 That’s exactly what a system at your stage needs.