# PROJECT_CONTEXT.md

> **Status:** Living
> **Owner:** Project Maintainers
> **Last Verified:** `c366e81`

Part of the [AI Engineering Handbook](CLAUDE.md). This document explains what the project is and how to navigate its documentation. For engineering rules, guardrails, and repository navigation, see [`CLAUDE.md`](CLAUDE.md).

## Mission & Operational Context

The SFA Admin PWA is an internal administration application for Surfers for Autism, a nonprofit that runs surf therapy events for children and adults with autism. It supports chapter staff and volunteers across the full event lifecycle: planning and publishing events, managing participant and volunteer rosters, assigning people to sessions, running day-of check-in, verifying waivers, sending communications, and reviewing executive-level reporting.

Two operational constraints shape the application beyond typical CRUD-app concerns:

- **Event-day usage**: check-in and session assignment are used live, on-site, often on mobile devices at beach locations — connectivity can be inconsistent (see `docs/event-day-operator-sheet.html` and `docs/event-day-troubleshooting-sheet.html`, and the offline-sync work referenced in historical release notes).
- **Participant safety and liability data**: waiver signing, verification, and audit trail are treated as a first-class subsystem, not an afterthought — see [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) for the waiver lifecycle design.

The application is used by admin/chapter staff, not by event participants directly — participants and volunteers interact only through narrow, token-gated public flows (event signup, waiver e-signing).

## Documentation Map

This repository contains two categories of documentation: the AI Engineering Handbook (this document's family — living, authoritative, describes current implementation) and a large body of historical governance material (frozen at the point it was written, kept for institutional record, never edited).

**When any historical document conflicts with the handbook or with the code, the handbook and the code win.** See [`CLAUDE.md`](CLAUDE.md)'s Documentation Hierarchy for the full trust order.

### AI Engineering Handbook (Authoritative)

Six documents — `CLAUDE.md`, `PROJECT_CONTEXT.md`, `ARCHITECTURE_OVERVIEW.md`, `FEATURE_INVENTORY.md`, `DEVELOPMENT_WORKFLOW.md`, `KNOWN_TECHNICAL_DEBT.md` — are living and authoritative for the current implementation. See [`CLAUDE.md`](CLAUDE.md)'s Documentation Hierarchy for what each one covers.

### Historical Governance Documents (Reference Only — Never Edit)

| Document | Covers |
|---|---|
| `ARCHITECTURE.md` | Architecture as of "Phase 3 baseline" — superseded by `ARCHITECTURE_OVERVIEW.md` |
| `docs/ARCHITECTURE_DECISIONS.md` | ADR-001–051 decision log, through Phase 6 Increment 6 |
| `ROADMAP_INTENT.md` | Sprint/phase planning intent, through Phase 6 Increment 6 |
| `PHASE2_IMPLEMENTATION_PLAN.md` | Phase 2 (waiver system) implementation plan |
| `PHASE4_1_ARCHITECTURE_REVIEW_PACKET.md` | Phase 4.1 domain-boundary design proposal |
| `PHASE4_PLANNING_KICKOFF_BRIEF.md` | Phase 4 planning handoff brief |
| `PHASE4_ROADMAP_ARCHITECTURE_PLANNING_GATE.md` | Phase 4 sub-phase roadmap proposal |
| `PHASE5_5_MESSAGE_TEMPLATE_RENDERING_PLAN.md` | Phase 5.5 email-provider-foundation plan (filename predates a scope rename — content is not message-template rendering) |
| `PHASE6_SPECIFICATION_AND_DESIGN.md` | Resiliency pipeline (execution/retry/circuit-breaker) design and build narrative |
| `PROJECT_BASELINE_v1.0.0.md` | Governance baseline snapshot at v1.0.0 |
| `PROJECT_BASELINE_v1.22.0-beta-rc1.md` | Governance baseline snapshot at v1.22.0-beta-rc1 |
| `RELEASE_NOTES_v0.1.0.md` | Release record for v0.1.0 |
| `RELEASE_NOTES_v0.2.0-rc.1.md` | Release record for v0.2.0-rc.1 |
| `PROJECT_SYNC_BRIEF.md` | Reverse-chronological session log, Phase 2 through Phase 9. The most detailed narrative history in the repository — useful for *why* something was built a certain way — but it is a point-in-time snapshot, not continuously maintained, and has previously lagged `master` by dozens of commits. Verify anything recent against `git log` before relying on it. |
| `NOTES.md` | Spring 2026 changelog; its later sections duplicate old README boilerplate |
| `docs/releases/*` | Per-phase release-board decision memos and remediation evidence |
| Root `.txt` files (`App Startup Commands.txt`, `Deployment Notes.txt`, etc.) | Informal working notes from past sessions; superseded by `DEVELOPMENT_WORKFLOW.md` |

`README.md` (root) is a separate case: it is the human-facing GitHub landing page, not part of the handbook and not purely historical (parts of it are still accurate). It is not authoritative for AI assistants — prefer the handbook — and it is out of scope for this documentation set to maintain.

### Proposed, Not Yet Adopted

`GOVERNANCE_FRAMEWORK_V2.md` describes a proposed future governance process (Gate A–H). Its target artifact directory, `docs/governance_v2/`, does not exist in the repository. Treat it as proposed only, not in effect, until that changes.

## Versioning Scheme

This repository has used two independent, non-mapped version numbers over its history — both expressed as git tags:

- **Governance baseline versions** (`v1.0.0` → `v1.22.0` and beyond, e.g. `v1.17.0-phase6-increment6-circuit-breaker-boundary`): internal phase/increment milestones, recorded in `PROJECT_BASELINE_*.md` and the historical governance documents. These track *development process* checkpoints, not deployments.
- **Product release versions** (`v0.1.0`, `v0.2.0-rc.1`, `v0.2.0-rc.2`, mirrored in `admin-app/package.json`'s `version` field): actual release candidates, tracked in `RELEASE_NOTES_*.md`.

To determine what is actually deployed or currently released, use the product release version (`admin-app/package.json`, `RELEASE_NOTES_*.md`, git tags matching `vX.Y.Z[-rc.N]` without a `-phaseN-` segment) — not the governance baseline number.

## Documentation Drift Disclosure

The historical governance documents were, by design, maintained heavily during active phase work and then frozen once a phase closed — this is why several of them (the ADR log, the roadmap, `PHASE6_SPECIFICATION_AND_DESIGN.md`) stop mid-project rather than at the current state. This is expected and not a defect to fix.

The AI Engineering Handbook (this document and its five siblings) is the only documentation in this repository intended to be kept continuously current. If you find the handbook itself out of sync with the code, that is a defect — update the relevant handbook document in the same commit/PR as the change that caused the drift, per [`CLAUDE.md`](CLAUDE.md)'s Mandatory Engineering Rules.
