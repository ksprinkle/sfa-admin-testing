# Roadmap Intent Template (Planning Only)

## Session Start Copy Block

Copy and paste these 5 lines into ChatGPT at session start:
1. Use PROJECT_SYNC_BRIEF.md as implementation truth.
2. Treat ROADMAP_INTENT.md as planning intent only.
3. Return only prioritized backlog items with acceptance criteria and non-goals.
4. Do not mark any item implemented without commit evidence from PROJECT_SYNC_BRIEF.md.
5. Flag conflicts or assumptions explicitly before proposing the roadmap.

Purpose
- Capture planning direction from ChatGPT.
- Keep planning separate from implementation truth.
- Feed clean, actionable priorities into Copilot sessions.

Rule of authority
- This file is planning intent only.
- Implementation truth lives in PROJECT_SYNC_BRIEF.md and git commits.
- If this file conflicts with PROJECT_SYNC_BRIEF.md, treat PROJECT_SYNC_BRIEF.md as correct.

Companion document
- Implementation status and session handoff: PROJECT_SYNC_BRIEF.md

## 1) Session Metadata

- Date:
- Planner source: ChatGPT / Manual / Mixed
- Planning horizon: 1 sprint / 2 weeks / release milestone
- Requested by:
- Related brief revision date:

## 2) Current Assumptions

List assumptions used for planning.

- Assumption 1:
- Assumption 2:
- Assumption 3:

## 3) Prioritized Roadmap (Top 3 First)

For each item, include clear acceptance criteria and non-goals.

### ITEM-001: <Title>
- Priority: P0 / P1 / P2
- Why now:
- Scope:
- Acceptance criteria:
  - [ ]
  - [ ]
  - [ ]
- Non-goals:
  -
- Dependencies:
  -
- Risk level: Low / Medium / High

### ITEM-002: <Title>
- Priority: P0 / P1 / P2
- Why now:
- Scope:
- Acceptance criteria:
  - [ ]
  - [ ]
  - [ ]
- Non-goals:
  -
- Dependencies:
  -
- Risk level: Low / Medium / High

### ITEM-003: <Title>
- Priority: P0 / P1 / P2
- Why now:
- Scope:
- Acceptance criteria:
  - [ ]
  - [ ]
  - [ ]
- Non-goals:
  -
- Dependencies:
  -
- Risk level: Low / Medium / High

## 4) Constraints and Guardrails

- Must preserve existing production behavior unless explicitly changed.
- Must support mobile and desktop operator workflows.
- Must avoid regressions in offline queue and sync behavior.
- Must keep API contract changes documented before implementation.

Project-specific constraints
-

## 5) Open Questions

- Q1:
- Q2:
- Q3:

## 6) Copilot Implementation Intake

Paste this section into a Copilot request when starting implementation.

Implementation request
- Use PROJECT_SYNC_BRIEF.md as implementation source of truth.
- Treat this ROADMAP_INTENT.md as planning intent only.
- Implement only ITEM IDs explicitly marked Approved for Build.
- If assumptions conflict with code, report the mismatch and propose smallest safe path.
- After implementation, update PROJECT_SYNC_BRIEF.md with commit-backed outcomes.

Approved for Build
- [ ] ITEM-001
- [ ] ITEM-002
- [ ] ITEM-003

## 7) Anti-Drift Checklist

Before starting code:
- [ ] Confirm selected ITEM IDs still match current priorities.
- [ ] Confirm acceptance criteria are testable and unambiguous.
- [ ] Confirm non-goals are explicit.
- [ ] Confirm dependencies are available.

After coding session:
- [ ] Mark delivered criteria with commit evidence in PROJECT_SYNC_BRIEF.md.
- [ ] Move unfinished criteria into next session plan.
- [ ] Record any scope changes or trade-offs.

## 8) Revision Log

- Rev 1:
  - Date:
  - Summary of planning changes:
  - Reason:
