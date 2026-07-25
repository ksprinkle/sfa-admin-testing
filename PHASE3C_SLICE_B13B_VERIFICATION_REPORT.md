# Phase 3C — Slice B13b: Verification Report

## Status
Phase: 3C — Identity Capability Transition, Slice B13b
Mode: Implementation — Relationship Ownership Resolution Engine
Repository changes: 1 existing file edited (`api/services/capability_resolution.py`), 1 existing file annotated with a comment only (`api/services/participant_claiming.py`), 1 new test file.

## B13b Mission (as authorized)

> Implement the centralized relationship-aware ownership resolution engine that will become the single source of truth for ownership decisions in later slices, while making no production behavior changes. This engine will not yet be used by any endpoints.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/services/capability_resolution.py` | New `resolve_manageable_person_ids(db, current_user) -> set[UUID]`, added alongside the existing dormant `resolve_household_ids_for_person()` (B5) rather than a separate module — per explicit review of the B13 architecture review's item #1 decision point, confirmed with the user before implementation. Implements the review's §4 canonical two-rule policy: (1) the caller's own `Person` is always manageable (direct/self); (2) any `Person` reached via an active, verified (`verified_at IS NOT NULL`), `can_register_for` `PersonRelationship` from the caller's `Person` is also manageable (delegated). |
| `api/services/participant_claiming.py` | Comment only, no behavior change — cross-references the known relationship-eligibility duplication noted below. |
| `tests/test_ownership_resolution.py` (new) | 9 tests: direct ownership only, verified active relationship expansion, multiple children, unverified relationship ignored, `can_register_for=False` ignored, revoked relationship ignored, duplicate relationship rows deduplicated, user without a `Person` returns an empty set, and relationship direction is not reversible (the *related* party does not inherit management of the *subject*). |

**Not touched, per approved scope**: no endpoint, router, or other service calls `resolve_manageable_person_ids()` — confirmed by a repository-wide grep before commit. No schema change, no migration — the function is a read-only query against existing `Person`/`PersonRelationship` columns (all present since B1/B4).

## 2. The key architectural property: still inert

Nothing in the application calls `resolve_manageable_person_ids()` outside its own test file. `participant_identity.py`'s `list_own_registrations()` and `get_own_participant_or_404()` — the two functions the B13 review names as eventual (B13c/B13d) consumers — are untouched. `tests/test_participant_identity.py` and `tests/test_my_registrations.py` pass unmodified, direct proof this slice changes no existing ownership query or authorization decision.

## 3. Query pattern — no N+1

Two queries total, flat regardless of how many relationships the caller has:
1. `resolve_person_for_user()` — resolves the caller's own `Person` (unchanged, existing B5 helper).
2. One `db.query(PersonRelationship.related_person_id).filter(...)` selecting only the `related_person_id` column, fully filtered in SQL (`subject_person_id`, `status`, `can_register_for`, `verified_at IS NOT NULL`).

Both IDs are unioned into a Python `set`, which also handles deduplication of multiple relationship rows pointing at the same person.

## 4. Known duplication — flagged, not resolved this slice

`participant_claiming.py`'s Pass 2 (relationship-based claiming, B7) independently filters on `status == STATUS_ACTIVE` and `can_register_for.is_(True)` — the same eligibility condition this slice's query expresses, but without a `verified_at` check. The two are, as of this slice, two independent inline copies of the same policy, and they have already diverged: `resolve_manageable_person_ids()` additionally requires `verified_at IS NOT NULL`.

This is currently unobservable in practice — `create_person_relationship()` (B13a) unconditionally sets `verified_at` at creation, so no code path produces an eligible row without it today. Both files now carry a comment cross-referencing this fact and recommending a shared eligibility predicate be extracted before B13d cuts any real read path over, so the two can't silently disagree if that assumption ever stops holding. Not fixed in this slice, per the user's explicit review decision to not hold B13b for it.

## 5. Full test suite

`PYTHONIOENCODING=utf-8 python -m unittest discover tests`: **193 tests (184 pre-existing + 9 new), 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap.** Zero new failures. (Without `PYTHONIOENCODING=utf-8` set, this Windows shell's default `cp1252` console encoding causes additional, unrelated import-time failures — `api/db/session.py`'s startup banner prints a `✅` character the console can't encode — in several test modules that happen to import it. Not a regression from this slice: `api/db/session.py` is untouched by B13b, and the same extra failures reproduce identically regardless of which B13b files are present.)

## 6. No schema or database change

Confirmed — `people` and `person_relationships` (B1/B4) already have every column this slice reads (`Person.user_id`, `PersonRelationship.subject_person_id`/`related_person_id`/`status`/`can_register_for`/`verified_at`). No migration added or needed.

## 7. Rollback

Revert the single commit. No data implications — this is a pure read-only addition; nothing writes through it, and no existing row or query is affected either way.

---

## 8. Production deployment (2026-07-25)

Committed (`5a9592d`), tagged `v1.46.0-phase3c-b13b-ownership-resolution-engine`, pushed to `origin/master`. No migration ran (correct — no schema change).

**Live validation** — no credentials available for the standing verification account or admin login within this session, so validation combined an independently-verifiable API check with the user's own confirmation:

| Check | Method | Result |
|---|---|---|
| Deploy succeeded / service healthy | `POST /api/public/events/fake-event-test/register` (anonymous, no credentials needed) | `201` |
| Admin dashboards unaffected | User's own direct confirmation | "Dashboards work as expected" |

Participant-facing endpoints (`/api/participants/mine`, `/api/auth/me`) were not independently re-checked live for this slice specifically, since `resolve_manageable_person_ids()` is called from nowhere yet — the same "deliberately inert" property proven locally (§2) means there is no live code path this deploy could have changed. The one thing an inert, additive service addition can break is the deploy itself (import errors, boot failures), which the anonymous-registration check above rules out directly.

## 9. Conclusion

B13b activates the B13 architecture review's ownership-resolution policy as a real, callable, fully-tested function for the first time — `resolve_manageable_person_ids()` — while proving directly (not just asserting) that it is not yet consulted by anything. `api/services/participant_identity.py` required zero changes. This is the second of the four proposed B13 sub-slices (`B13a` → `B13b` → `B13c` → `B13d`); each subsequent one still requires its own explicit authorization.

**Deployed to production 2026-07-25 and validated live** (§8). **Status: Production validated; observation window in progress.** **B13c and B13d remain not authorized.**
