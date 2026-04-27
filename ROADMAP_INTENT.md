Roadmap Intent (Planning Only)
1) Session Metadata
Date: 2026-04-26
Planner source: ChatGPT
Planning horizon: 1 sprint (stabilization + pre-release hardening)
Requested by: Project owner
Related brief revision date: 2026-04-26
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

 ITEM-001
 ITEM-002
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

🧠 Why This Roadmap Is Correct (quick context)

This roadmap does not add new features.

It focuses on:

Eliminating ambiguity (ITEM-001)
Handling failure gracefully (ITEM-002)
Ensuring reliability at scale (ITEM-003)

👉 That’s exactly what a system at your stage needs.