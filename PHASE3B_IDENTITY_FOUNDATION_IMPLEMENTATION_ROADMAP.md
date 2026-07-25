# Phase 3B — Identity Foundation: Implementation Roadmap

## Status
Phase: 3B — **COMPLETE**
Phase 3C — Identity Capability Transition: **B8 through B13a CLOSED**
Production Baseline: `v1.45.0-phase3c-b13a-relationship-lifecycle`
Closed out: 2026-07-21 (3B); B8-B11 closed out 2026-07-21, B12 closed out 2026-07-22, B13a closed out 2026-07-25

This document is a roadmap, not an architecture document — the architecture was settled in [`PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md`](PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md), which this roadmap treats as accepted, with the refinements recorded in §0 below. Per project convention, Phase documents are historical record once written — this roadmap does not edit 3A, it amends and sequences it.

## Phase 3B Closeout (2026-07-21)

Slices B0 through B7 are complete, deployed to production, and validated — each with its own report (`PHASE3B_SLICE_B<N>_*.md`). Formally declared **Phase 3B – Identity Foundation: COMPLETE**, with `v1.39.0-phase3b-b7-identity-write-path` adopted as the new production baseline.

What exists in production as of this baseline: `Person`, `Role`, `PersonRole` (dual-read authorization, B3), `Household`/`PersonRelationship` (B4), the capability resolution engine (B5, not yet consulted by anything live), a proven-safe shadow-check on one endpoint (B6), and a real identity write-path — `Participant.person_id` populated at registration and at claim time, plus relationship-aware claiming consultation logic (B7, currently dormant — no relationship-creation flow exists yet). `has_permission()`, every router, and admin authorization remain byte-for-byte what they were before B1. Full detail on what each slice actually shipped is in its own report; this is the index, not a restatement.

One unrelated production bug (`docs/waiver-signing.html` accidentally gitignored since 2026-07-17, never actually deployed) was found and fixed during B7's observation window — see `KNOWN_TECHNICAL_DEBT.md` for the postmortem. It was frontend-only and never touched by any B-slice; it doesn't affect this closeout.

**B8 onward is not authorized by this closeout.** Per the user's explicit framing, B8 requires its own fresh architecture review before any implementation, rather than the direct per-slice authorization B1–B7 received — it's the first slice to expose the capability engine through a real endpoint. Do not begin B8 work of any kind until that review happens and is explicitly approved.

### Naming clarification (2026-07-21) — "Phase 3C" disambiguated going forward

Two unrelated efforts had both used the label "Phase 3C": the original `PHASE3_DIGITAL_DOCUMENTS_PLATFORM_ARCHITECTURE_REVIEW.md` (Digital Documents Platform, paused pending this identity work) and B8's own baseline tag, `v1.40.0-phase3c-b8-capability-exposure`. Resolved by explicit user decision: **historical work is not renamed** — `PHASE3_DIGITAL_DOCUMENTS_PLATFORM_ARCHITECTURE_REVIEW.md` and the existing `v1.40.0-phase3c-b8-capability-exposure` tag both stand exactly as written. Going forward, the two streams are distinguished as:

- **Phase 3C – Identity Capability Transition**: B8 onward (capability exposure, and eventually capability-based authorization decisions replacing legacy checks).
- **Phase 4 – Digital Documents Platform**: the work described in `PHASE3_DIGITAL_DOCUMENTS_PLATFORM_ARCHITECTURE_REVIEW.md`, still paused, to be referred to as Phase 4 in any new document or discussion from this point on.

**B8 – Capability Exposure: CLOSED (2026-07-21).** Observation window completed cleanly, matching the precedent set by B6 and B7. `v1.40.0-phase3c-b8-capability-exposure` is adopted as the new canonical production baseline.

### B9 — first authoritative capability decision (architecture approved 2026-07-21, pending one production-log condition before implementation)

Per the user: B9 is "the first slice that changes who decides access rather than merely exposing or validating information," and warrants at least the scrutiny B3 and B7 received — arguably more. Full review: [`PHASE3C_SLICE_B9_ARCHITECTURE_REVIEW.md`](PHASE3C_SLICE_B9_ARCHITECTURE_REVIEW.md).

**Architecture approved**, with these decisions: `GET /api/participants/mine` migrates from `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` to a new `require_capability(...)` dependency in `api/dependencies.py` (capability engine itself unmodified); the validation plan treats participant-success as the only positive case and admin-403 as a regression check, not a success case (admin does not carry `participants.view_own` today, unchanged by this slice); the B6 runtime shadow-check call site is removed from this endpoint as part of B9 (its tests and reports remain as historical evidence); direct replacement is used, not a temporary dual-decision phase.

**One condition remains before implementation begins**: confirmation that B6's production shadow-check logged zero genuine authorization mismatches during its observation window. If confirmed, implementation proceeds under direct replacement as approved. If B6 in fact surfaced a real mismatch, stop and investigate before writing any B9 code.

**Condition confirmed** — no matches found searching all Application Logs for `capability_engine_shadow_mismatch`. Implemented, deployed (`405b8c3`, tagged `v1.41.0-phase3c-b9-capability-enforcement`), and validated live 2026-07-21: fresh throwaway participant account succeeds (`200`) on `GET /api/participants/mine`, anonymous request still `401`, zero `capability_engine_authorization_error`/`capability_engine_authorization_denied` log entries, admin dashboard/executive dashboard/communications unaffected. Full detail in [`PHASE3C_SLICE_B9_VERIFICATION_REPORT.md`](PHASE3C_SLICE_B9_VERIFICATION_REPORT.md).

**B9 – First Capability-Based Authorization: CLOSED (2026-07-21).** Observation window completed cleanly — no unexpected `capability_engine_authorization_error` entries — matching the precedent set by B6 through B8. `v1.41.0-phase3c-b9-capability-enforcement` is adopted as the new canonical production baseline for Phase 3C – Identity Capability Transition. This is the first production endpoint whose authorization is decided solely by the Capability Resolution Engine; legacy `has_permission()`/`require_permission()` remains authoritative for every other endpoint.

### B10 — redefined (2026-07-21): second capability migration, not legacy-field retirement

A dedicated architecture review ([`PHASE3C_SLICE_B10_ARCHITECTURE_REVIEW.md`](PHASE3C_SLICE_B10_ARCHITECTURE_REVIEW.md)) was run against the *current* codebase, per the user's request, rather than against this roadmap's original assumption that B10 would retire `User.role`/`Participant.user_id`. It found that assumption unsafe, for two reasons the user agreed are the review's most important findings:

1. **`PersonRole` issuance is not continuous.** Tracing every migration that creates a `PersonRole` row: B3's migration backfilled one, once, at its own deploy time. Nothing since then — not `POST /auth/register`, not any other code path — has ever created a `PersonRole` row. Every account created after B3 deployed (which by now is most or all real accounts, given B5–B9's own testing activity) has a `Person` but zero `PersonRole` rows, and resolves entirely through the legacy fallback in both `has_permission()` and `has_capability()`. The system isn't transitioning away from `User.role` — it's maintaining two permanently-diverging populations, one static (pre-B3, has `PersonRole`) and one growing (post-B3, legacy-only).
2. **`Participant.person_id` is write-only.** `person_id` is populated everywhere `user_id` is (B7), but `api/services/participant_identity.py` — which backs both self-service participant endpoints — filters exclusively on `Participant.user_id`. No code path anywhere reads `person_id` for row-level ownership scoping. The migration to the canonical identity model is only half-complete on the read side.

Two further findings, agreed to be tracked as **architectural correctness issues** (not ordinary debt) in `KNOWN_TECHNICAL_DEBT.md`, prerequisites for legacy-field retirement rather than blockers to B10 itself: `GET /admin/permissions/me` (`api/routers/admin_permissions.py`) reads `current_user.role` directly, bypassing the capability/dual-read path entirely; and the three role-mutation endpoints in `auth.py` (`update_user_role`, `update_user_role_by_email`, `update_user_role_by_email_body`) only ever write the legacy `User.role` field, never touching `PersonRole` — so changing a role via the admin UI on any account that already has a stale `PersonRole` grant from B3's backfill has no effect on that account's actual resolved permissions today.

**Revised sequencing, approved by the user:**

```
B9  — First capability enforcement (CLOSED)
B10 — Second capability migration: GET /api/participants/{participant_id} (CLOSED)
B11 — Continuous PersonRole issuance (CLOSED)
B12 — Participant.person_id reconciliation (CLOSED)
B13 — Relationship-Aware Ownership Resolution (redefined 2026-07-22 from "person_id read-path migration"; new feature, review not started)
Future — Legacy-field retirement (User.role / Participant.user_id column drops, gated on B13's new model)
```

**Redefined 2026-07-21** (`PHASE3C_SLICE_B12_ARCHITECTURE_REVIEW.md`): the original single "B12 read-path migration" assumed `Participant.person_id` was already complete for every row. It isn't — both write paths (`public_registration.py`, `participant_claiming.py`) silently leave `person_id` null whenever the acting user's `Person` didn't exist yet at that moment, the same gap shape B10 found for `PersonRole`. Split into **B12 (reconciliation, data-only)** and **B13 (the actual read-path switch, gated on B12's clean production verification)** — mirroring the B10→B11 relationship exactly.

**Redefined again 2026-07-22** (`PHASE3C_SLICE_B13_ARCHITECTURE_REVIEW.md`): B13's own review found the read-path swap itself unsafe — not a data-completeness problem, but a semantic one (`Participant.user_id` and `Participant.person_id` encode different concepts, ownership vs. subject identity, that only coincide in today's data because relationship-based claiming has never fired in production). B13 is retired as a migration and replaced with a new feature, Relationship-Aware Ownership Resolution — see the dedicated section below.

**B10 (redefined)**: migrate `GET /api/participants/{participant_id}` from `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` to `require_capability(...)` — the sibling of the one permission B9 already proved live, same file, same author, zero new schema risk. Architecture accepted 2026-07-21, authorized, implemented, deployed (`d794396`, tagged `v1.42.0-phase3c-b10-own-participant-capability`), and validated live 2026-07-21: owner succeeds (`200`), non-owner denied (`404`, ownership scoping unaffected), anonymous rejected (`401`), `GET /api/participants/mine` unchanged from B9, admin dashboard/executive dashboard/communications unaffected, zero `capability_engine_authorization_error`/`_denied` log entries. Full detail in [`PHASE3C_SLICE_B10_VERIFICATION_REPORT.md`](PHASE3C_SLICE_B10_VERIFICATION_REPORT.md).

**B10 – Second Capability-Based Authorization: CLOSED (2026-07-21).** Observation window completed cleanly, no production anomalies, matching the precedent set by B6 through B9. `v1.42.0-phase3c-b10-own-participant-capability` is adopted as the new canonical production baseline for Phase 3C – Identity Capability Transition. Both self-service participant endpoints (`GET /participants/mine`, `GET /participants/{participant_id}`) are now authorized solely by the Capability Resolution Engine; every other endpoint remains on legacy `has_permission()`. Next architectural focus (per the user, review not yet started): **B11 — Continuous PersonRole Issuance**, the first of B10's two identified prerequisites for legacy-field retirement, following the same review → minimal slice → production validation → observation window → closeout rhythm.

**B11 and B12 are explicitly deferred**, each requiring its own dedicated architecture review before any implementation, since both alter fundamental identity behavior (continuous `PersonRole` issuance changes what happens on every registration and role change; the `person_id` read-path migration changes what rows a caller can see). Neither review has started.

---

## 0. Refinements Adopted Since 3A

Three adjustments to 3A, recorded here rather than by editing that document:

1. **Capabilities, not roles, are what the system (and the UI) should reason about.** `PersonRole` grants and `PersonRelationship` capability flags are both *inputs*; the thing every consumer — routers, and eventually the frontend — should actually check is a resolved **capability**: "can this person, right now, do this specific thing to this specific target." §5 below (`capability_resolution.py`) is the single place this union happens. No router or page should inspect `role` or `relationship_type` directly going forward.
2. **`relationship_type` is a descriptive label; capability flags are the actual authority**, and the two are independent after creation. A `relationship_type` supplies sensible *default* capability flags at the moment a `PersonRelationship` row is created, but nothing ever re-derives capabilities from the type at read time — two `relationship_type="grandparent"` rows can carry entirely different flags. This was already the shape proposed in 3A §3.1; this roadmap calls it out explicitly because it determines how `PersonRelationship` is created and read in the slices below (§3.3, §5).
3. **Three identity concepts must be kept distinct, not conflated** — surfaced by the B13 architecture review (`PHASE3C_SLICE_B13_ARCHITECTURE_REVIEW.md`), which found `Participant.user_id` and `Participant.person_id` had silently drifted into answering two different questions:
   - **Authentication identity** — *who is logged in?* (`User`, resolved via the JWT.)
   - **Subject identity** — *which real person does this record represent?* (`Person`, via `person_id`.)
   - **Ownership/management identity** — *who is permitted to access or manage this record?* Currently `Participant.user_id`; for the relationship-claiming case (`participant_claiming.py`'s Pass 2), this is deliberately a *different* person than the subject identity (a guardian managing a child's registration) — by design, not an error.

   These three had been implicitly treated as one concept ("identity") through B1–B12; B13's review is what made the distinction load-bearing, because a column swap that conflates subject identity with ownership identity silently drops relationship-based access the moment it's used. Any future work in this area (household visibility, caregiver portals, delegated management) should reason about these as three separate questions, not one.

---

## 1. Sequencing Principle

No single large migration. Every slice below is additive-only until explicitly marked otherwise, independently deployable, leaves the system fully working immediately after merge, and has its own rollback path. A slice that changes real behavior never ships in the same step as the schema it depends on — schema arrives first, inert, is verified against production data, and only then does a later slice start reading it. This mirrors the guarded-migration discipline already mandated project-wide (`CLAUDE.md`), applied at the level of feature sequencing, not just individual migrations — deliberately, since this project's two real production incidents this month both trace back to trusting a migration/stamp state that hadn't been independently verified.

### 1.1 Migration Verification Checklist (permanent, added after B4's incident)

Every migration in this rollout — and, per the user's direction, every future migration in this project regardless of feature area — must be verified against all of the following before it is deployed, not just the SQLite-only checks used through B3:

1. Clean upgrade on an empty database.
2. Clean upgrade on a realistically populated database (seeded *before* earlier migrations run, so their own backfills actually populate it).
3. Idempotent replay (direct re-invocation of `upgrade()` against an already-migrated database).
4. Partial catch-up validation, if the migration backfills anything.
5. Clean downgrade.
6. **Compile the migration's generated DDL against the real PostgreSQL dialect** (`sqlalchemy.schema.CreateTable(table).compile(dialect=sqlalchemy.dialects.postgresql.dialect())` or equivalent for `ALTER TABLE`/index/constraint operations) — no running Postgres server required. Mandatory whenever a migration involves defaults, constraints, indexes, expressions, enums, generated values, or any other database-specific SQL, since SQLite's looser typing (confirmed directly at B4: `BOOLEAN DEFAULT 0` passes silently on SQLite, and PostgreSQL rejects it outright) can let a real bug through every other check on this list.

B4 is the reason this exists: a boolean `server_default` written as a raw integer literal (`sa.text("0")`) passed every other check and still failed in production, caught only by Postgres's own type strictness during a real deploy. The fix (`sa.false()`, a dialect-portable construct) and the dialect-compile check above are both now permanent practice, not a one-off remediation.

### 1.2 Project-Wide Ownership Constraint

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
| **B9** | `GET /participants/mine` migrates to `require_capability()` | None | First real capability-based authorization decision | Yes — backend only |
| **B10** | `GET /participants/{participant_id}` migrates to `require_capability()` | None | Second capability migration — sibling of B9's endpoint, same permission | Yes — backend only — **CLOSED** |
| **B11** | Continuous `PersonRole` issuance at registration and role-change time, plus a one-time reconciliation migration | None (writes to existing table) | Closes the gap found in B10's review: `PersonRole` backfill was a one-time B3 snapshot, not ongoing | Yes — backend only — **CLOSED** |
| **B12** | One-time reconciliation of `Participant.person_id` from `Participant.user_id` | None (data-only) | Closes the gap found in B10's/B12's own review: `person_id` write paths silently no-op when the acting user's `Person` doesn't exist yet | Yes — backend only, single migration — **CLOSED** |
| **B13** *(redefined 2026-07-22, review not started)* | Relationship-Aware Ownership Resolution — a new ownership-policy feature, not a `user_id`→`person_id` column swap | Likely none, TBD by its own review | B13's own review found the originally-planned column swap unsafe: `user_id` and `person_id` encode different concepts (ownership vs. subject identity) that only coincide today because relationship-based claiming has never fired in production | Its own future roadmap item — needs a full architecture review before implementation |
| **Future** *(not in this rollout)* | Retire `User.role` / `Participant.user_id` | Drop columns, guarded | `User.role`: gated on B11's burn-in. `Participant.user_id`: gated on the new B13 existing and being proven equivalent — not a fixed timeline | Its own future roadmap item, deliberately excluded here |

### B0 — Call-site audit (no schema, no code)

3A §8 flagged this as a prerequisite: confirm there is no code checking `current_user.role == "admin"` (or similar) outside `authorization.py`'s central map, and enumerate every current reader of `Participant.user_id` (`participant_identity.py`, `GET /api/participants/mine`, `participant_claiming.py`, any admin router). Output is a checklist, not a change. This determines the exact scope of B3's and B7's "needs updating in lockstep" list rather than assuming it.

**Complete** — see [`PHASE3B_SLICE_B0_CALL_SITE_AUDIT.md`](PHASE3B_SLICE_B0_CALL_SITE_AUDIT.md). Confirmed: exactly one enforcement point (`authorization.py::has_permission`) across all 18 routers, no bypasses found. One design-relevant finding for B3: the three role-mutation endpoints in `auth.py` implement single-role overwrite semantics and will need a grant/revoke redesign, not a mechanical retarget — noted as a B3 detail, not a re-sequencing. B1 sequencing confirmed valid, unchanged.

**Rollback:** nothing to roll back — it's an audit.

### B0.5 — Canonical Ownership Audit (no schema, no code)

Immediately after B0, and before any schema lands, answer one question across every existing entity: **"What currently belongs to a Person?"** Produced as a standalone, standing reference — [`PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`](PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md) — rather than a section here, since its purpose is to be checked against by every future feature and code review, not read once. It distinguishes **subject ownership** ("whose record is this") from **actor attribution** ("who performed this action") — the two are easy to conflate under one "owner" column, and only the first is what Phase 3B migrates.

That audit is also where this roadmap's project-wide constraint (§1.2) gets its teeth: a concrete, checkable answer for every entity, not a judgment call made fresh per feature.

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

**Complete and deployed** — see [`PHASE3B_SLICE_B4_SCHEMA_VERIFICATION_REPORT.md`](PHASE3B_SLICE_B4_SCHEMA_VERIFICATION_REPORT.md). `Household`/`PersonRelationship` models, migration `c8f2b6a4d1e9`. No admin-CRUD was added this time (narrower than the "may include" language above — the user's explicit B4 authorization ruled out any API change this slice). Verified on clean and populated databases, idempotent replay confirmed, clean downgrade, zero new test failures, and confirmed by grep that neither table is referenced anywhere outside its own model file — full isolation. No backfill or inference attempted, per explicit instruction and consistent with the ownership audit's finding that no existing data exists to infer from.

First deploy attempt failed in production (PostgreSQL rejected `BOOLEAN DEFAULT 0` on the five capability-flag columns — a real type-strictness difference from SQLite that local-only testing missed); the migration's transactional DDL rolled back cleanly with no partial state, the bug was fixed (`sa.false()` instead of a raw integer literal, confirmed by compiling the DDL against the real PostgreSQL dialect), and the second deploy succeeded — `Schema status: MATCH`, live participant/admin checks all matching pre-B4 behavior exactly. Compiling migration DDL against the PostgreSQL dialect before deploying is now a standing step for any future migration touching typed column defaults.

### B5 — `capability_resolution.py`

New, additive service module implementing the single function every future consumer should call: something like `resolve_capabilities(db, *, actor_person, target_person=None) -> set[str]`, combining (a) the union of the actor's active `PersonRole` grants (via B3), (b) — only when `target_person` is given and differs from the actor — the capability flags on any active `PersonRelationship` from actor to target, and (c) implicit full self-capability when `target_person is None` or equals the actor. This is the one place the §0.1 refinement ("capabilities, not roles") becomes real code — every subsequent slice and every future router should call this function rather than inspecting `role`/`relationship_type` directly.

Given this codebase's documented thin test coverage on identity-adjacent routers, this is a good place to actually add real unit tests as the function is built — it's new, self-contained logic with no existing caller to break, and the highest-leverage place to invest test effort given B7 will make relationship-based access authoritative for real user actions.

**Backward compatibility:** total — a new function nothing calls yet.
**Ships independently:** yes, backend-only.
**Rollback:** delete the file; nothing depends on it yet.

**Complete and deployed** — see [`PHASE3B_SLICE_B5_VERIFICATION_REPORT.md`](PHASE3B_SLICE_B5_VERIFICATION_REPORT.md), including the Capability Resolution Equivalence Report (9 scenarios, all passing, including a new one proving the Relationships-layer scaffolding grants nothing even when an active, fully-permissive `PersonRelationship` row exists). `api/services/capability_resolution.py` — zero existing files touched at all (first slice with that property). Full test suite: 121/121 non-pre-existing-failure tests pass. Committed (`cf5f0a0`), tagged `v1.37.0-phase3b-b5-capability-engine`, deployed to production 2026-07-20 — no schema drift (no migration in this slice), live participant/admin checks confirm behavior identical to pre-B5.

### B6 — Shadow-check on `GET /api/participants/mine`

Add a second, parallel access check inside this one existing, already-read-only endpoint: alongside the current `Participant.user_id == current_user.id` check, also compute the answer `resolve_capabilities()` (B5) would have given, and log (not enforce) any disagreement. This is the first point real production traffic exercises the new capability path, deliberately on the lowest-risk endpoint available (read-only, already scoped to "my own records," no side effects) and deliberately non-enforcing — the old check remains the one that actually decides the response. Run this for a real observation period before trusting the new path anywhere else.

**Backward compatibility:** total — the response is unchanged; only logging is added.
**Ships independently:** yes, backend-only.
**Rollback:** remove the shadow check; trivial, since it was never load-bearing.

**Complete and deployed** — see [`PHASE3B_SLICE_B6_SHADOW_VALIDATION_REPORT.md`](PHASE3B_SLICE_B6_SHADOW_VALIDATION_REPORT.md). Shadow-check added to `GET /api/participants/mine` only; `api/services/capability_resolution.py` gained an additive `resolve_capabilities_with_context()` (re-verified against all of B5's equivalence tests, unchanged). Proven directly (not by inference): a forced-mismatch test shows the response is unaffected either way, a spy confirms the engine runs on every eligible request, the full existing suite (129 tests, including 13 pre-existing tests against this exact endpoint) shows zero spurious mismatch warnings, and **production's own Application Logs confirm zero mismatches** across real admin traffic and real participant requests. `has_permission()` and every router dependency/decorator are byte-for-byte unchanged. Committed (`81f7061`), tagged `v1.38.0-phase3b-b6-shadow-validation`, deployed to production 2026-07-20.

### B7 — Relationship-aware claiming; `person_id` becomes the write target

The first slice that changes real behavior. `participant_claiming.py` (or its successor) starts, in addition to today's exact-email match, creating a `PersonRelationship` when a registration's email doesn't match the claiming user but a guardian relationship can otherwise be established (the precise matching rule — e.g., an explicit "register on behalf of" flow at registration time vs. an inferred match — is a product decision for this slice itself, not decided in this roadmap). New registrations start populating `Participant.person_id` directly (via B2's column) going forward, in parallel with the still-populated `user_id`. This is the slice that actually closes the gap identified in 3A §1.5 (today, a parent registering children under different emails gets no automatic linkage at all).

**Backward compatibility:** `user_id` continues to be set exactly as before, in parallel — nothing currently reading `user_id` breaks. `GET /participants/mine`, check-in gating, and any other existing `user_id` consumer are untouched by this slice; they migrate to `person_id`/capability-based checks only in a later, separate slice once B6's shadow-check has run long enough to build confidence.
**Requires coordinated frontend work:** only if the product decision above involves a new "who is this for" step in the registration UI; the backend change (parallel-writing `person_id`, optionally creating relationships) is shippable and dormant without any frontend change if that UI work is deferred.
**Rollback:** revert the service-layer change; `user_id`-based behavior is untouched throughout, so rollback has no data-loss risk — any `PersonRelationship` rows already created by this slice are simply not created going forward, and existing ones are harmless to leave in place.

**Complete and deployed** — see [`PHASE3B_SLICE_B7_VERIFICATION_REPORT.md`](PHASE3B_SLICE_B7_VERIFICATION_REPORT.md). Went through a full plan-mode architecture gate before implementation, resolving two scope questions with the user: B7 also creates a `Person` at account registration (`POST /auth/register`, plus a data-only gap-window backfill migration) so `person_id` population is actually achievable going forward, and relationship-aware claiming is consultation-only — no new relationship-creation flow, so it is real, tested code with no live trigger in production yet (proven honestly via a synthetic fixture, not real data, matching B4/B5's own standard). `person_id` is now set alongside `user_id` at registration and at claim time; `claim_participants_for_user()` gained an independent relationship-based matching pass with its own audit action. 142 tests (129 + 13 new), zero new failures. `has_permission()`, `authorization.py`, `dependencies.py`, admin authorization, and every router untouched. Committed (`479664c`), tagged `v1.39.0-phase3b-b7-identity-write-path`, deployed to production 2026-07-20 — `Schema status: MATCH`, full live sequence (register → login → register for a real event → confirm on My Registrations) matched pre-B7 behavior exactly, and — the strongest check in the rollout so far — validated directly against persisted database state via a production Postgres query, confirming the new User→Person→Participant linkage end-to-end with zero duplicates. Per the user's acceptance sequence, full B7 sign-off also requires a period of normal production traffic with no log anomalies before B8 begins.

### B8 — `GET /api/me/capabilities`

A new, read-only endpoint (or an additive field on the existing `GET /auth/me`) that returns the caller's resolved capability set from B5, keyed by target where relevant (e.g., `{"self": [...], "relationships": {"<person_id>": [...]}}` — exact shape is an implementation detail for that slice, not fixed here). This is the contract Phase 3D's adaptive frontend will consume instead of raw role/relationship data, per the §0.1 refinement.

**Backward compatibility:** total — purely additive endpoint/field.
**Ships independently:** yes, on the backend; it has no user-visible effect until a frontend (out of this roadmap's scope, belongs to Phase 3D) starts calling it.

### B10 — second capability migration: `GET /api/participants/{participant_id}`

Migrates the sibling of B9's endpoint from `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` to `require_capability(...)` — same permission, same file, same proven-equivalent engine, no schema change. Implemented, deployed, and closed 2026-07-21 (`v1.42.0-phase3c-b10-own-participant-capability`) — see the closeout section above.

### B11 — Continuous `PersonRole` issuance

B10's architecture review found that `PersonRole` backfill has only ever run once, at B3's deploy — every account created since then has no `PersonRole` at all and resolves entirely through the legacy `User.role` fallback. Full review: [`PHASE3C_SLICE_B11_ARCHITECTURE_REVIEW.md`](PHASE3C_SLICE_B11_ARCHITECTURE_REVIEW.md).

**Architecture approved 2026-07-21**: registration grants an initial `PersonRole` in the same commit as `Person` (new `api/services/person_role_management.py`, kept separate from `capability_resolution.py`'s read-only resolution and `authorization.py`'s pure mapping); the three admin role-mutation endpoints now revoke the previous `PersonRole` and grant the new one alongside their existing `User.role` write, closing the divergence bug B10's review flagged; a one-time, guarded, data-only reconciliation migration syncs every existing `Person`'s active `PersonRole` to their current `User.role`, treating `User.role` as ground truth. No schema changes.

**Implemented, deployed (`eabc808`, tagged `v1.43.0-phase3c-b11-person-role-issuance`), and validated live 2026-07-21**: reconciliation migration ran for real (`d5a9e2c7f3b1 -> e1c4b7a9d2f6`), `Schema status: MATCH`; a fresh throwaway registration confirmed via direct Render Shell query to have a real, active `person_roles` row (`('participant', 'active', ...)`) — not just a working legacy fallback; an admin role change via the UI confirmed to actually update `PersonRole` now; admin dashboard/executive dashboard/communications unaffected; Application Logs clean of registration/role-update failures, migration anomalies, or integrity violations. Full detail in [`PHASE3C_SLICE_B11_VERIFICATION_REPORT.md`](PHASE3C_SLICE_B11_VERIFICATION_REPORT.md).

**Unrelated bug found and fixed within this slice** (user's explicit choice): `PUT /admin/users/by-email/role` was permanently unreachable, shadowed by `/admin/users/{user_id}/role` (registered first, identical path shape) — fixed by reordering route registration. See `KNOWN_TECHNICAL_DEBT.md`'s resolved postmortem entry.

**B11 – Continuous PersonRole Issuance: CLOSED (2026-07-21).** Observation window completed cleanly, no production anomalies. `v1.43.0-phase3c-b11-person-role-issuance` is adopted as the new canonical production baseline for Phase 3C – Identity Capability Transition. Every new account is now capability-native from registration; every admin role change keeps `PersonRole` and `User.role` synchronized; every existing account has been reconciled once.

### B12 — `Participant.person_id` reconciliation

B10's review found `Participant.person_id` write-only in general; this slice's own review (`PHASE3C_SLICE_B12_ARCHITECTURE_REVIEW.md`) went further and found the data itself is **not actually complete**: both write paths (`public_registration.py`, `participant_claiming.py`) silently leave `person_id` null whenever the acting user's `Person` didn't exist yet at that exact moment — the same gap shape B10 found for `PersonRole`, one layer down. The originally-planned single "B12 read-path migration" assumed this data was already correct; it isn't, so the plan is now split:

- **B12 (this slice)**: a one-time, guarded, data-only reconciliation migration — for every `Participant` with `user_id` set and `person_id` null, backfill `person_id` from the correlated `Person`. No schema change, no behavior change, nothing reads `person_id` yet.

  **Implemented, deployed (`2024413`, tagged `v1.44.0-phase3c-b12-participant-person-reconciliation`), and validated live 2026-07-22.** Pre-implementation production baseline (`SELECT count(*) FROM participants WHERE user_id IS NOT NULL AND person_id IS NULL`): `0`. Deploy log confirmed the migration ran for real (`e1c4b7a9d2f6 -> f7b3d9a1c5e8`), `Schema status: MATCH`. Post-deploy, the same baseline query still returned `0` — confirming the migration was a true no-op against production data, exactly as predicted. `GET /api/participants/mine`, `GET /api/auth/me`, and anonymous access all regression-tested clean; admin dashboard/executive dashboard/communications unaffected; Application Logs showed nothing unusual. Full detail in [`PHASE3C_SLICE_B12_VERIFICATION_REPORT.md`](PHASE3C_SLICE_B12_VERIFICATION_REPORT.md).

**B12 – `Participant.person_id` Reconciliation: CLOSED (2026-07-22).** Observation window completed cleanly, no production anomalies. `v1.44.0-phase3c-b12-participant-person-reconciliation` is adopted as the new canonical production baseline for Phase 3C – Identity Capability Transition. `Participant.person_id` is now reconciled for every existing row; the gap this migration exists to close is permanently guarded against reopening.

### B13 — superseded and redefined: Relationship-Aware Ownership Resolution (2026-07-22)

Originally planned as the `person_id`-based read-path switch, brought forward by the user with an explicit, elevated requirement for query-level equivalence proof. The architecture review (`PHASE3C_SLICE_B13_ARCHITECTURE_REVIEW.md`) found that requirement was exactly the right instinct, and turned up something a column swap can't fix: `participant_claiming.py`'s relationship-based claiming pass (Slice B7 Part 2, real code, zero live trigger rows in production so far) deliberately sets `Participant.user_id` to the *claiming guardian* while leaving `Participant.person_id` pointing at the *registrant* — by design, not a defect. A straight swap would silently strip a guardian's access to a child's registration the moment any real `PersonRelationship` row exists, and query-level equivalence testing against today's production data would pass cleanly and still be wrong, since the one divergent case has no live rows yet to expose it. See §0.3 above for the underlying distinction (authentication identity / subject identity / ownership identity) this surfaced.

**User's decision**: reject both "ship the narrow swap now" (would knowingly deploy something correct only because a supported feature hasn't been exercised in production yet) and "treat `user_id` as permanent" (would prematurely foreclose the identity model's original goal — `PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md` — of guardians managing dependents' registrations under their own account). **B13 is retired as "person_id read-path migration" and replaced with a new B13: Relationship-Aware Ownership Resolution** — not a migration, a new feature. Ownership becomes a resolved policy, not a column: *owner if `participant.person == caller.person`, OR `participant.person` is related to `caller.person` via an active `PersonRelationship` that grants registration authority.* Needs its own full architecture review before any implementation — none has started. Also depends on a relationship-creation flow that doesn't exist yet (still deferred, same as noted at B4/B7).

**Legacy-field retirement implication**: `Participant.user_id` retirement is deferred until the new ownership-resolution model exists and has been proven equivalent (or intentionally and explicitly evolved) — not declared permanent, not scheduled on a fixed timeline.

**Architecture review completed 2026-07-22** (`PHASE3C_SLICE_B13_RELATIONSHIP_OWNERSHIP_ARCHITECTURE_REVIEW.md`, authorized by the user as a review — implementation not authorized): finds this feature needs no new schema and no new engine — `capability_resolution.py`'s Relationships layer (`_resolve_relationship_capabilities()`) was built at B5 specifically as a dormant extension point for this exact case, never activated. Proposes a two-rule ownership policy (direct `person_id` match, or an active `can_register_for` `PersonRelationship`) provably equivalent to today's `user_id`-based access for all current data (since relationship-based claiming has never fired in production); admin-only relationship creation with immediate verification (reusing `PersonRelationship`'s existing but unused `verified_at`/`verified_by_user_id` fields) as the first implementation; a centralized `resolve_manageable_person_ids()` query avoiding N+1; and a B6-style shadow-check phase before any cutover. Proposes sub-sequencing **B13a** (relationship creation lifecycle) → **B13b** (ownership resolution engine) → **B13c** (shadow-check) → **B13d** (cutover) → **Future** (`Participant.user_id` retirement) — each still requiring its own explicit authorization before implementation, per this project's standing practice.

**B13a — Relationship Lifecycle (creation only): authorized, implemented, deployed, and production-validated 2026-07-25.** Shipped: admin-only `POST`/`GET /admin/person-relationships` (`api/routers/admin_person_relationships.py`), immediately active and verified using the model's existing `verified_at`/`verified_by_user_id` fields, via a new write-only `api/services/person_relationship_management.py` mirroring B11's `person_role_management.py` shape. Revocation/editing deliberately deferred, not assumed in-scope. `api/services/capability_resolution.py` and `api/services/participant_identity.py` untouched — 184 tests, same 4 pre-existing errors, zero new failures, including a test proving a maximally-permissive relationship row has zero effect on capability resolution. Deployed (`475c825`, tagged `v1.45.0-phase3c-b13a-relationship-lifecycle`) and validated live: a real relationship created via the admin endpoint between two throwaway accounts came back with `status: "active"` and both verification fields auto-populated; confirmed via the list endpoint; the guardian account's own `GET /api/participants/mine`/`GET /auth/me` were completely unaffected by having a real, fully-permissive relationship attached to it; admin dashboards unaffected. Full detail in [`PHASE3C_SLICE_B13A_VERIFICATION_REPORT.md`](PHASE3C_SLICE_B13A_VERIFICATION_REPORT.md).

**B13a – Relationship Lifecycle: CLOSED (2026-07-25).** Observation window completed cleanly, no production anomalies. `v1.45.0-phase3c-b13a-relationship-lifecycle` is adopted as the new canonical production baseline for Phase 3C – Identity Capability Transition. Verified `PersonRelationship` records can now be created in production, still architecturally dormant with respect to participant access. **B13b, B13c, and B13d remain not authorized** — each needs its own explicit go-ahead.

**B13b — Ownership Resolution Engine: authorized, implemented, deployed, and production-validated 2026-07-25.** Shipped: `resolve_manageable_person_ids(db, current_user) -> set[UUID]` added to `api/services/capability_resolution.py`, alongside the existing dormant `resolve_household_ids_for_person()` (B5) rather than a separate module — the user's explicit decision on the B13 review's item #1 open question. Implements the review's canonical two-rule policy: direct ownership (the caller's own `Person`) plus delegated ownership (any `Person` reached via an active, verified, `can_register_for` `PersonRelationship`). Single relationship query, no N+1. Nothing calls this function outside its own tests — `participant_identity.py` untouched, confirmed by repo-wide grep. 193 tests (184 pre-existing + 9 new), same 4 pre-existing errors, zero new failures. A known duplication was found and flagged (not fixed, per explicit user decision): `participant_claiming.py`'s Pass 2 independently implements the same relationship-eligibility filter, and the two have already diverged (this function additionally requires `verified_at IS NOT NULL`) — both files now carry a cross-referencing comment recommending a shared predicate be extracted before B13d. Deployed (`5a9592d`, tagged `v1.46.0-phase3c-b13b-ownership-resolution-engine`) and validated live: anonymous registration returned `201` confirming a healthy deploy, and the user directly confirmed admin dashboards work as expected. Full detail in [`PHASE3C_SLICE_B13B_VERIFICATION_REPORT.md`](PHASE3C_SLICE_B13B_VERIFICATION_REPORT.md). **Status: Production validated; observation window in progress.** **B13c and B13d remain not authorized.**

### Future — Retirement of `User.role` / `Participant.user_id` (explicitly future, not part of this rollout)

`User.role` retirement remains gated on B11's continuous-issuance model (already shipped) proving out over a burn-in period. `Participant.user_id` retirement is gated on the new B13 (Relationship-Aware Ownership Resolution) existing and being proven equivalent to today's `user_id`-based ownership — not on a fixed timeline, per the decision above. A dedicated future slice would then stop writing the legacy fields and, eventually, drop them — with its own guarded migration and its own call-site audit, repeating B0's discipline rather than assuming the original audit still holds. Explicitly out of scope for this roadmap; listed only so it isn't lost.

**Sequencing history**: this item was originally labeled "B9" (renamed to "B10" on 2026-07-21 to resolve a naming collision with the real B9), then redefined again on 2026-07-21 after B10's own architecture review found legacy-field retirement unsafe as a next slice — see `PHASE3C_SLICE_B10_ARCHITECTURE_REVIEW.md` for the full reasoning. "B10" now refers to the second capability migration above; this retirement work is deferred, unnumbered ("Future"), pending B11 and B12.

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
