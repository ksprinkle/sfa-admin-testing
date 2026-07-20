# Phase 3B — Identity Foundation: Implementation Roadmap

## Status
Phase: 3B Implementation Roadmap
Mode: Sequencing / Planning Only
Implementation: Not Authorized
Repository Changes: None (no code, no migrations, no models — this is a sequencing plan for future implementation slices)

This document is a roadmap, not an architecture document — the architecture was settled in [`PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md`](PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md), which this roadmap treats as accepted, with the refinements recorded in §0 below. Per project convention, Phase documents are historical record once written — this roadmap does not edit 3A, it amends and sequences it.

---

## 0. Refinements Adopted Since 3A

Two adjustments to 3A, recorded here rather than by editing that document:

1. **Capabilities, not roles, are what the system (and the UI) should reason about.** `PersonRole` grants and `PersonRelationship` capability flags are both *inputs*; the thing every consumer — routers, and eventually the frontend — should actually check is a resolved **capability**: "can this person, right now, do this specific thing to this specific target." §5 below (`capability_resolution.py`) is the single place this union happens. No router or page should inspect `role` or `relationship_type` directly going forward.
2. **`relationship_type` is a descriptive label; capability flags are the actual authority**, and the two are independent after creation. A `relationship_type` supplies sensible *default* capability flags at the moment a `PersonRelationship` row is created, but nothing ever re-derives capabilities from the type at read time — two `relationship_type="grandparent"` rows can carry entirely different flags. This was already the shape proposed in 3A §3.1; this roadmap calls it out explicitly because it determines how `PersonRelationship` is created and read in the slices below (§3.3, §5).

---

## 1. Sequencing Principle

No single large migration. Every slice below is additive-only until explicitly marked otherwise, independently deployable, leaves the system fully working immediately after merge, and has its own rollback path. A slice that changes real behavior never ships in the same step as the schema it depends on — schema arrives first, inert, is verified against production data, and only then does a later slice start reading it. This mirrors the guarded-migration discipline already mandated project-wide (`CLAUDE.md`), applied at the level of feature sequencing, not just individual migrations — deliberately, since this project's two real production incidents this month both trace back to trusting a migration/stamp state that hadn't been independently verified.

### 1.1 Project-Wide Ownership Constraint

No feature implemented during Phase 3B, or after, may introduce a new **subject-ownership** relationship — a new "whose record is this" foreign key — unless the owner is explicitly a `Person` (via `person_id`), or is explicitly and deliberately identified as legacy-for-backward-compatibility (e.g., `Participant.user_id` during the B1–B9 transition described below). Concretely: no `Volunteer.user_id`, no `Sponsor.user_id`, no `Parent.user_id` — no new, parallel, role-specific identity link, even where it looks like the fastest way to unblock a specific feature. Every new ownership decision gets checked against [`PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`](PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md) (produced in slice B0.5, below) before a new FK is added anywhere — this is what prevents accidental reintroduction of a parallel identity model exactly like the one this whole effort exists to retire.

This constraint applies only to subject ownership. Actor/attribution fields — "who performed this action," "who authored this message" (`AdminAuditEvent.actor_user_id`, `CommunicationMessage.created_by_user_id`) — may continue to reference `User` directly; that is a different, still-valid concern tied to the credential active at the time, not to identity. The ownership audit makes this distinction concrete per entity rather than leaving it a judgment call.

---

## 2. Slice Sequence

| Slice | What ships | Schema change | Reads/writes existing data? | Ships independently? |
|---|---|---|---|---|
| **B0** | Call-site audit | None | Read-only analysis | Yes — no code |
| **B0.5** | Canonical Ownership Audit | None | Read-only inventory | Yes — no code |
| **B1** | `Person` + `Role` tables | Additive tables | Backfill only, nothing reads them | Yes — backend only |
| **B2** | `person_id` on `Participant`/`VolunteerProfile` | Additive columns | Backfill from `user_id`, nothing reads the new column | Yes — backend only |
| **B3** | `PersonRole`, dual-read authorization | Additive table | Backfill from `User.role`; `has_permission()` starts reading it with a fallback | Yes — backend only, behavior-preserving |
| **B4** | `PersonRelationship` + `Household` | Additive tables | Net new, no backfill | Yes — backend only |
| **B5** | `capability_resolution.py` | None | New service function, unused by any endpoint yet | Yes — backend only |
| **B6** | Shadow-check on `GET /participants/mine` | None | Compares old vs. new access decision, logs mismatches, still serves the old decision | Yes — backend only |
| **B7** | Relationship-aware claiming; `person_id` becomes the write target for new registrations | None (uses B1–B4 schema) | Behavior change: claiming can now create/attach `PersonRelationship` rows | Backend-only to ship; a registration-flow UI enhancement is optional and separable |
| **B8** | `GET /api/me/capabilities` (or extend `GET /auth/me`) | None | Read-only, exposes resolved capabilities | Backend ships independently; has no visible effect until a frontend (Phase 3D) consumes it |
| **B9** *(future, not in this rollout)* | Retire `User.role` / `Participant.user_id` | Drop columns, guarded | Only after a full burn-in period post-B7 | Its own future roadmap item, deliberately excluded here |

### B0 — Call-site audit (no schema, no code)

3A §8 flagged this as a prerequisite: confirm there is no code checking `current_user.role == "admin"` (or similar) outside `authorization.py`'s central map, and enumerate every current reader of `Participant.user_id` (`participant_identity.py`, `GET /api/participants/mine`, `participant_claiming.py`, any admin router). Output is a checklist, not a change. This determines the exact scope of B3's and B7's "needs updating in lockstep" list rather than assuming it.

**Complete** — see [`PHASE3B_SLICE_B0_CALL_SITE_AUDIT.md`](PHASE3B_SLICE_B0_CALL_SITE_AUDIT.md). Confirmed: exactly one enforcement point (`authorization.py::has_permission`) across all 18 routers, no bypasses found. One design-relevant finding for B3: the three role-mutation endpoints in `auth.py` implement single-role overwrite semantics and will need a grant/revoke redesign, not a mechanical retarget — noted as a B3 detail, not a re-sequencing. B1 sequencing confirmed valid, unchanged.

**Rollback:** nothing to roll back — it's an audit.

### B0.5 — Canonical Ownership Audit (no schema, no code)

Immediately after B0, and before any schema lands, answer one question across every existing entity: **"What currently belongs to a Person?"** Produced as a standalone, standing reference — [`PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`](PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md) — rather than a section here, since its purpose is to be checked against by every future feature and code review, not read once. It distinguishes **subject ownership** ("whose record is this") from **actor attribution** ("who performed this action") — the two are easy to conflate under one "owner" column, and only the first is what Phase 3B migrates.

That audit is also where this roadmap's project-wide constraint (§1.1) gets its teeth: a concrete, checkable answer for every entity, not a judgment call made fresh per feature.

**Rollback:** nothing to roll back — it's an audit, kept as a living reference and revised in place as slices land, never superseded by a new file.

### B1 — `Person` + `Role`, purely additive

Add `people` (id, email, first_name/last_name if desired, created_at) and `roles` (code, display_name) tables via a guarded migration (`has_table` checks, per project convention). Backfill: exactly one `Person` row per existing `User`, copying `email`; two `Role` rows (`participant`, `admin`) matching today's `ROLE_PERMISSIONS` keys. No FK from any existing table points at `people`/`roles` yet — nothing in the application reads or writes them. This slice exists solely to prove the new tables against real production data before anything depends on them.

**Backward compatibility:** total — nothing changes, since nothing reads the new tables.
**Ships independently:** yes, backend-only, zero frontend involvement.
**Rollback:** drop `people`/`roles` (guarded `downgrade()`); safe, since nothing references them.

**Complete and deployed** — see [`PHASE3B_SLICE_B1_SCHEMA_VERIFICATION_REPORT.md`](PHASE3B_SLICE_B1_SCHEMA_VERIFICATION_REPORT.md). `api/models/person.py`, `api/models/role.py`, migration `f3a8d1c6b9e2`. Verified against a full local replay of the migration history (clean upgrade/downgrade, 1:1 backfill, idempotency confirmed under direct replay including a partial-catch-up scenario, zero new test failures, zero existing call sites touched), then committed (`e8ec100`, `496e16b`), tagged `v1.33.0-phase3b-b1-schema-foundation`, and deployed to production 2026-07-20 — confirmed live via the Render deploy log (`alembic upgrade head` applied `e8b4a2f6c1d9 -> f3a8d1c6b9e2` against real production Postgres, boot diagnostic reports `Schema status: MATCH`).

### B2 — `person_id` on `Participant` and `VolunteerProfile`

Add nullable `person_id` (FK → `people.id`) to both tables via a guarded migration. Backfill `Participant.person_id` from the `Person` linked to `Participant.user_id` (via B1's backfill); `VolunteerProfile.person_id` has no existing link to backfill from and starts null for every row (closing part of the "two parallel volunteer concepts" gap starts here, but only the schema — no volunteer-facing behavior changes yet). Still nothing in application code reads `person_id`.

**Backward compatibility:** total — additive column, unread.
**Ships independently:** yes, backend-only.
**Rollback:** drop the columns; nothing depended on them being populated.

**Complete and deployed** — see [`PHASE3B_SLICE_B2_SCHEMA_VERIFICATION_REPORT.md`](PHASE3B_SLICE_B2_SCHEMA_VERIFICATION_REPORT.md). `Participant.person_id`/`VolunteerProfile.person_id`, migration `a7d3f9c2e5b8`. Verified on both a clean and a realistically populated database: correct backfill (linked participants get the correlated `Person`, unlinked stay `NULL`, volunteer profiles all `NULL`), idempotency and partial-catch-up confirmed under direct replay, zero new test failures, zero application call sites reference the new column. `user_id` remains authoritative throughout. Committed (`c9ac9c6`), tagged `v1.34.0-phase3b-b2-schema-foundation`, deployed to production 2026-07-20 — confirmed live via the Render deploy log (`f3a8d1c6b9e2 -> a7d3f9c2e5b8` applied against production Postgres, `Schema status: MATCH`).

### B3 — `PersonRole`, dual-read authorization

Add `person_roles` (`person_id`, `role_code`, `granted_at`, `granted_by_user_id`, `status`) via a guarded migration. Backfill one active row per existing `User.role`. Change `authorization.py::has_permission()` to compute permissions from the union of a person's active `PersonRole` grants **when any exist**, falling back to the existing single-`role` lookup otherwise (a safety net, not a permanent two-path design — B1's backfill should make every account have a `PersonRole` row, so the fallback should never actually trigger in steady state). Before merging, run a one-off verification script comparing the old permission set and the new resolved permission set for every existing user — this should be an exact match for every account, since nothing about role assignment has changed yet, only how it's read.

**Backward compatibility:** behavior-preserving by construction (backfill is 1:1 and exhaustive); the fallback path is the actual compatibility mechanism.
**Ships independently:** yes, backend-only — permission *strings* returned to any router are unchanged, only their computation path changes.
**Rollback:** revert the `has_permission()` change (trivial single-function revert); `person_roles` table stays but goes unread again, harmless.

**Complete and deployed** — see [`PHASE3B_SLICE_B3_SCHEMA_VERIFICATION_REPORT.md`](PHASE3B_SLICE_B3_SCHEMA_VERIFICATION_REPORT.md), including the full Authorization Equivalence Report (10 scenarios, all passing, including forward-compatibility and revoked-role edge cases). `PersonRole` model, migration `b4e6a1d9c3f7`, dual-read in `has_permission()` via `object_session(user)` — zero router or dependency-signature changes. Full test suite: 112/112 non-pre-existing-failure tests pass. Committed (`2719527`), tagged `v1.35.0-phase3b-b3-authorization-foundation`, deployed to production 2026-07-20 — `Schema status: MATCH`, live participant login/route-access/denial confirmed via a real test account, admin login and admin-only route access confirmed directly.

### B4 — `PersonRelationship` + `Household`

Add `households` (id, name, created_at) and `person_relationships` (`subject_person_id`, `related_person_id`, `relationship_type`, capability flag columns, `household_id` nullable, `status`, `verified_at`/`verified_by_user_id` nullable) via a guarded migration. No backfill — nothing analogous exists today (confirmed in 3A §5, `Participant` has no emergency-contact or guardian fields to migrate off of). Per the §0 refinement, `relationship_type` populates the capability-flag columns only **at row-creation time** (application-layer default, not a DB trigger or computed column) — once created, a row's flags are independent of its type. This slice may include minimal admin-only CRUD to create/edit relationships for manual testing, but no existing flow reads or writes them yet.

**Backward compatibility:** total — net new, nothing else changes.
**Ships independently:** yes, backend-only.
**Rollback:** drop both tables; zero blast radius, since nothing outside this slice references them.

### B5 — `capability_resolution.py`

New, additive service module implementing the single function every future consumer should call: something like `resolve_capabilities(db, *, actor_person, target_person=None) -> set[str]`, combining (a) the union of the actor's active `PersonRole` grants (via B3), (b) — only when `target_person` is given and differs from the actor — the capability flags on any active `PersonRelationship` from actor to target, and (c) implicit full self-capability when `target_person is None` or equals the actor. This is the one place the §0.1 refinement ("capabilities, not roles") becomes real code — every subsequent slice and every future router should call this function rather than inspecting `role`/`relationship_type` directly.

Given this codebase's documented thin test coverage on identity-adjacent routers, this is a good place to actually add real unit tests as the function is built — it's new, self-contained logic with no existing caller to break, and the highest-leverage place to invest test effort given B7 will make relationship-based access authoritative for real user actions.

**Backward compatibility:** total — a new function nothing calls yet.
**Ships independently:** yes, backend-only.
**Rollback:** delete the file; nothing depends on it yet.

### B6 — Shadow-check on `GET /api/participants/mine`

Add a second, parallel access check inside this one existing, already-read-only endpoint: alongside the current `Participant.user_id == current_user.id` check, also compute the answer `resolve_capabilities()` (B5) would have given, and log (not enforce) any disagreement. This is the first point real production traffic exercises the new capability path, deliberately on the lowest-risk endpoint available (read-only, already scoped to "my own records," no side effects) and deliberately non-enforcing — the old check remains the one that actually decides the response. Run this for a real observation period before trusting the new path anywhere else.

**Backward compatibility:** total — the response is unchanged; only logging is added.
**Ships independently:** yes, backend-only.
**Rollback:** remove the shadow check; trivial, since it was never load-bearing.

### B7 — Relationship-aware claiming; `person_id` becomes the write target

The first slice that changes real behavior. `participant_claiming.py` (or its successor) starts, in addition to today's exact-email match, creating a `PersonRelationship` when a registration's email doesn't match the claiming user but a guardian relationship can otherwise be established (the precise matching rule — e.g., an explicit "register on behalf of" flow at registration time vs. an inferred match — is a product decision for this slice itself, not decided in this roadmap). New registrations start populating `Participant.person_id` directly (via B2's column) going forward, in parallel with the still-populated `user_id`. This is the slice that actually closes the gap identified in 3A §1.5 (today, a parent registering children under different emails gets no automatic linkage at all).

**Backward compatibility:** `user_id` continues to be set exactly as before, in parallel — nothing currently reading `user_id` breaks. `GET /participants/mine`, check-in gating, and any other existing `user_id` consumer are untouched by this slice; they migrate to `person_id`/capability-based checks only in a later, separate slice once B6's shadow-check has run long enough to build confidence.
**Requires coordinated frontend work:** only if the product decision above involves a new "who is this for" step in the registration UI; the backend change (parallel-writing `person_id`, optionally creating relationships) is shippable and dormant without any frontend change if that UI work is deferred.
**Rollback:** revert the service-layer change; `user_id`-based behavior is untouched throughout, so rollback has no data-loss risk — any `PersonRelationship` rows already created by this slice are simply not created going forward, and existing ones are harmless to leave in place.

### B8 — `GET /api/me/capabilities`

A new, read-only endpoint (or an additive field on the existing `GET /auth/me`) that returns the caller's resolved capability set from B5, keyed by target where relevant (e.g., `{"self": [...], "relationships": {"<person_id>": [...]}}` — exact shape is an implementation detail for that slice, not fixed here). This is the contract Phase 3D's adaptive frontend will consume instead of raw role/relationship data, per the §0.1 refinement.

**Backward compatibility:** total — purely additive endpoint/field.
**Ships independently:** yes, on the backend; it has no user-visible effect until a frontend (out of this roadmap's scope, belongs to Phase 3D) starts calling it.

### B9 — Retirement of `User.role` / `Participant.user_id` (explicitly future, not part of this rollout)

Only after B7 has run in production through a full, deliberate burn-in period with no discrepancies surfaced by B6-style shadow-checking, plan a dedicated future slice to stop writing the legacy fields and, eventually, drop them — with its own guarded migration and its own call-site audit, repeating B0's discipline rather than assuming the original audit still holds. Explicitly out of scope for this roadmap; listed only so it isn't lost.

---

## 3. What Requires Coordinated Frontend + Backend Work

Everything through **B8** is backend-only and independently deployable with zero required frontend change — the existing admin and portal UIs continue to function unmodified throughout B1–B8, since every consumer-facing permission string, endpoint response shape (aside from the new, additive `/me/capabilities`), and session/login mechanism stays exactly as it is today. The only slice with an *optional* frontend touchpoint is **B7**, if the product decision made during that slice is to add a "register on behalf of" step to the registration form — and even then, the backend half of B7 is shippable and dormant without it. Genuine frontend build-out (an adaptive, capability-driven navigation and the actual guardian/household UI) is Phase 3D's scope, not this roadmap's — B8 exists here only to hand Phase 3D a stable contract to build against.

---

## 4. Rollback Points Summary

Every slice B1–B6 and B8 is schema-additive-only or logic operating on data nothing else reads yet — rollback in every one of those cases is either dropping an unused table/column (guarded `downgrade()`, already this project's standard pattern) or reverting a single function's logic, with no data-loss risk, because nothing production-critical depends on the new path until B7. **B7 is the one slice with real behavior change**, and even there, rollback is safe by design: it never stops writing the legacy `user_id` field, so reverting B7's code changes leaves the system exactly where B6 left it, with any `PersonRelationship` rows already created simply orphaned-but-harmless rather than something that needs to be undone. This is a deliberate property of the sequencing, not an incidental one — it is the direct answer to "what are the rollback points," chosen so that every slice except one has a trivial, data-safe rollback, and the one exception is engineered to be safe by never removing the fallback it's building toward replacing.

---

## 5. Success Criteria — Per-Slice Exit Gates

Objective conditions to consider each slice actually done, not just merged:

**B0 complete**
- Call-site checklist produced and reviewed.
- No code changed.

**B0.5 complete**
- Ownership matrix (`PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`) produced and reviewed.
- Every entity touched by this roadmap has an assigned Future Owner and Migration Required value — no "TBD" left unresolved for anything in scope.
- No code changed.

**B1 complete**
- `people`/`roles` tables exist in every environment.
- Backfill confirmed exactly 1:1 against every existing `User` row.
- No production behavior change. No API change. Existing tests pass.

**B2 complete**
- `person_id` columns exist on `Participant` and `VolunteerProfile`.
- Backfill confirmed correct for every `Participant` row with a non-null `user_id`.
- No API change; confirmed nothing in application code reads the new column yet.

**B3 complete**
- `person_roles` backfilled 1:1 against every existing `User.role`.
- Verification script confirms an identical resolved permission set, old path vs. new path, for every existing user — no diffs.
- `has_permission()` behavior unchanged from every caller's perspective. Existing tests pass.

**B4 complete**
- `households`/`person_relationships` tables exist.
- Manual relationship creation/editing verified against real data.
- No capability checks are active anywhere yet — the tables exist but influence nothing in production.

**B5 complete**
- `capability_resolution.py` merged with dedicated unit tests covering role-only, relationship-only, and self-ownership cases.
- Confirmed not called from any router yet.

**B6 complete**
- Shadow-check live on `GET /participants/mine` in production.
- A defined observation period has passed with logged (not enforced) comparisons.
- Zero discrepancies between old and new access decisions, or every discrepancy found is explained and resolved.
- Endpoint response is unchanged throughout.

**B7 complete**
- Relationship-aware claiming and `person_id`-writing are live.
- Capability evaluation is authoritative for the new path; legacy `user_id` writes still occur in parallel, unchanged.
- No user-visible regressions confirmed by manual verification. Existing tests pass; new tests cover the relationship-aware path.

**B8 complete**
- `GET /api/me/capabilities` (or the extended `/auth/me`) ships and returns correct results for role-only, relationship-only, and combined cases.
- Confirmed no frontend consumes it yet (expected — it's Phase 3D's dependency, not this roadmap's).

---

## 6. What This Roadmap Deliberately Excludes

- Any actual code, migration file, or model definition — this is a sequencing plan, per instruction.
- Phase 3C (Digital Documents) and Phase 3D (Unified Experience) scope — referenced only to show where B8's contract and B4's tables get consumed, not planned here.
- B9's retirement work — flagged as a distinct future roadmap item with its own audit, not folded into this rollout.
- Any product decision about exactly how B7's "who is this for" registration-time UX should work — that's a design decision for that slice, not a sequencing question this document answers.

This roadmap is complete. Approved, per user sign-off, to begin with B0 followed by the additive slices exactly as sequenced above; B0.5's Canonical Ownership Audit is produced as of this revision (see `PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`).
