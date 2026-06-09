# RC2 Release Decision Matrix

Date: 2026-06-08
Release Candidate: v1.0.0-rc2
Tagged Commit: 5a8ae6e
Release Manager Decision: DO NOT CREATE v1.0.0 YET

## Current Status
- Engineering: APPROVED
- Operational Gate: PENDING
- Active Release Candidate: v1.0.0-rc2

## Decision Matrix
| Item | Status | Notes |
|---|---|---|
| Code Complete | PASS | No further feature development approved before v1.0.0. |
| Architecture Locked | PASS | Waiver entity and compatibility decisions documented. |
| Governance Locked | PASS | Release and freeze policy documented. |
| Regression Validation | PASS | Completed in prior RC1/RC2 cycle. |
| Offline Validation | PASS | Completed in prior RC1/RC2 cycle. |
| Mobile Validation | PASS | Completed in prior RC1/RC2 cycle. |
| Smoke Test (baseline routes) | PASS | Site load/login/dashboard/events/participants/check-in route/registration page reachable. |
| Repository Clean | PASS | No pending source changes required for current decision. |
| RC2 Tagged | PASS | v1.0.0-rc2 created and pushed. |
| Operational Admin Workflow | PENDING | Requires admin account + active event + participant evidence for waiver-to-check-in flow. |
| Service Worker Registration Path | PENDING | App requests /assets/sw.js while /sw.js exists; needs fix or explicit acceptance. |

## Service Worker Decision Tree
1. Does the application function?
- If No: BLOCKER.
- If Yes: continue.

2. Is offline/PWA functionality part of v1.0 acceptance?
- If Yes: BLOCKER until resolved/accepted.
- If No: Observation that can be explicitly accepted.

Current assessment: treat as pending release gate item until explicitly resolved or accepted.

## Required Evidence Before v1.0.0 Tag
### Operational Admin Workflow Evidence
Run with one admin, one active event, and one participant:
1. Login as admin.
2. Open Event Detail.
3. Attempt check-in before waiver verification and confirm blocked.
4. Verify waiver using paper source (and/or staff_override).
5. Confirm check-in succeeds after verification.
6. Confirm waiver audit metadata is visible (source, version, verified_at, verifier, notes as applicable).

### Service Worker Path Evidence
Provide one of:
1. Confirmed fix and redeploy via a new RC tag (recommended: v1.0.0-rc3), then re-verify.
2. Formal acceptance decision documenting why this is non-blocking for v1.0.0.

## Tagging Rule
- Do not move existing tags.
- If any release-affecting fix is made, create a new RC tag.
- Tag v1.0.0 only on the exact commit that was deployed and verified.

## Freeze Rule Through v1.0.0
Allowed:
- Deployment fixes
- Critical bug fixes
- Documentation corrections

Not allowed:
- Feature additions
- Architectural redesign
- Last-minute behavior changes unrelated to blocker resolution

## Final Gate Decision
Current decision: HOLD v1.0.0.

Promote to v1.0.0 only after:
1. Operational admin workflow evidence is complete.
2. Service worker path issue is fixed or formally accepted.
3. Verification confirms the exact deployed commit to be tagged.
