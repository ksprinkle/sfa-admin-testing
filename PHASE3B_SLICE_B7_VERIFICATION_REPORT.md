# Phase 3B — Slice B7: Verification Report

## Status
Phase: 3B, Slice B7
Mode: Implementation — First Behavior-Changing Slice (Identity Write-Path + Relationship-Aware Claiming)
Repository Changes: 3 existing files edited, 1 new guarded migration (data-only, no schema change), 2 test files (one new, one extended).

## B7 Mission (as refined by the user, ahead of implementation)

> Two independent responsibilities: (1) Identity write-path transition — a data-model transition, not an authorization transition; new registrations begin writing `Participant.person_id`. (2) Relationship-aware claiming — the first time relationship semantics affect *who may access a participant*, not merely how permissions are computed.

This slice went through a full architecture gate before implementation (plan mode, two clarifying questions resolved with the user, a written and approved plan) given it is the roadmap's one designated behavior-changing slice. Both resolved decisions are recorded here for permanence:

1. **Person creation**: nothing created a `Person` for a `User` except B1's one-time backfill migration — every account created since (including every test account used in B3–B6's validation) had none. **Resolved: B7 creates a `Person` at account registration**, closing the gap that would otherwise have made "new registrations populate `person_id`" untrue in practice.
2. **Relationship creation**: `PersonRelationship` has zero rows in production and nothing creates one. **Resolved: B7 builds the consultation (read) side of claiming only** — no new relationship-creation flow. This is addressed directly in §4.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/routers/auth.py` | `register()` creates one `Person` row alongside the `User` it already creates, committed as its own step before the (unrelated, already-existing) verification-token logic. |
| `alembic/versions/d5a9e2c7f3b1_backfill_person_gap_window.py` | New migration, `down_revision = c8f2b6a4d1e9`. Re-runs B1's exact backfill logic for any `User` still missing a `Person` — data-only, no schema change, no new table/column. |
| `api/services/public_registration.py` | `register_public_participant()` sets `participant.person_id` alongside `participant.user_id`, for the identical population it already links (an authenticated `participant`-role caller) and no other. |
| `api/services/participant_claiming.py` | `claim_participants_for_user()` now: (a) sets `person_id` on email-matched claims (Part 1d), and (b) gains a second, independent matching pass — relationship-based claiming (Part 2), with its own audit action (`participant_relationship_claimed`, distinct from `participant_account_claimed`). |
| `tests/test_auth_register.py` | Extended: 2 new Person-creation tests, 1 new person_id-on-email-claim test, and a new `RelationshipAwareClaimingTests` class (6 tests). |
| `tests/test_registration_person_id.py` | New file, 4 tests covering `register_public_participant()`'s `person_id` behavior across authenticated/anonymous/admin/no-Person-yet callers. |

**Not touched at all** (confirmed by `git diff --stat`, empty output): `api/dependencies.py`, `api/services/authorization.py`, `api/services/capability_resolution.py`, `api/routers/events.py` (the router both registration endpoints live behind — only the shared service function it calls was edited), every admin router, every frontend file.

---

## 2. Part 1 — Identity write-path transition

**1a. Person creation at registration** — `POST /auth/register` now creates exactly one `Person` per new `User`, correlated via `user_id`, email copied — mirroring B1's backfill shape exactly. Proven: `test_registration_creates_correlated_person`, `test_registration_creates_exactly_one_person`.

**1b. Gap-window backfill migration** — verified against the exact real-world scenario it exists for: a user created *before* B1 (gets a `Person` from B1 itself), a user created *in the gap* between B1's deploy and this slice's deploy (had no `Person` until this migration), and — via a second replay — a user created *after* this migration already ran once (proving partial catch-up). All three ended up with exactly one correct `Person` each; idempotent replay produced zero duplicates. See §5.

**1c. `person_id` set on new registrations** — `register_public_participant()` sets `participant.person_id` only when the caller is an authenticated `participant`-role user *and* already has a `Person` (true for every account created after 1a/1b, by construction). Verified for all four relevant cases: authenticated participant with a `Person` (set), anonymous caller (null), admin caller (null — an admin token on this public endpoint never claims ownership, matching the existing `user_id` rule exactly), and the edge case of an authenticated participant *without* a `Person` yet (null `person_id`, but `user_id` still set — proving the two fields fail independently, not together).

**1d. `person_id` set on historical claims** — `claim_participants_for_user()`'s existing exact-email match now also sets `person_id`, verified directly (`test_email_matched_claim_also_sets_person_id`).

Throughout all of 1a–1d: **`user_id` is written in exactly the same places, under exactly the same conditions, as before this slice.** Nothing about `user_id`'s semantics or population changed — `person_id` is purely additive alongside it.

---

## 3. Part 2 — Relationship-aware claiming

`claim_participants_for_user()` gained a second matching pass, independent of the email-match pass: a still-unclaimed `Participant` (`user_id IS NULL`) whose `person_id` has an active, `can_register_for=True` `PersonRelationship` pointing at it from the verifying user's own `Person` gets claimed too — `user_id` is set (for today's ownership model), `person_id` is deliberately left untouched (it already correctly identifies the actual registrant, not the claiming account).

Six tests prove this precisely, not just the happy path:

| Test | Proves |
|---|---|
| `test_relationship_based_claim_succeeds_with_active_registration_capable_relationship` | The positive case: claim succeeds, `user_id` set, `person_id` untouched, a distinct `participant_relationship_claimed` audit event recorded. |
| `test_relationship_without_can_register_for_does_not_claim` | A relationship that exists but wasn't granted `can_register_for` does **not** claim — capability flags are checked, not merely relationship existence. |
| `test_revoked_relationship_does_not_claim` | A `status="revoked"` relationship is ignored, same as `PersonRole`'s revocation handling in B3. |
| `test_no_relationship_at_all_does_not_claim` | The baseline negative case. |
| `test_relationship_pointed_the_wrong_direction_does_not_claim` | `subject_person_id`/`related_person_id` are not treated as symmetric — a relationship granting the child authority over the parent must not accidentally let the parent claim via the reverse direction. |
| `test_email_match_and_relationship_match_both_run_without_double_counting` | Both passes can fire in the same call (one participant claimed by email, a second by relationship) without double-processing or interfering with each other — proving the `db.flush()` between passes does its job. |

**Why this is honestly dormant in production today, not a hidden risk**: `Participant.person_id` can only ever be set by Part 1c/1d above, and both only ever set it *alongside* `user_id`. No code path anywhere produces a row with `person_id` set and `user_id` null — meaning the relationship-based branch has no real row to match against in production. Every test above therefore constructs that combination directly as a fixture (a `Person` with no `User`, an unclaimed `Participant` pointing at it) rather than reproducing it through any real flow, because no real flow produces it yet. This is the same honesty standard already applied to B4's and B5's relationship scaffolding — the difference here is that this code path is wired into a real, invokable service function (`claim_participants_for_user`, called on every email verification) rather than sitting fully outside any call graph.

No new relationship-creation mechanism was added, per the resolved scope decision — a future, separate slice is what will give this consultation logic a real trigger in production.

---

## 4. Full test suite

`python -m unittest discover tests`: **142 tests (129 pre-existing + 13 new), 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures.**

---

## 5. Migration verification

- **Fresh database**: `alembic upgrade head` on an empty SQLite DB, full history through B7 — clean, no errors.
- **Populated database, exact gap-window scenario**: seeded a user *before* a simulated B1 (gets a `Person` from B1's own backfill), then added a second user *after* B1 ran but before B7's migration (the real gap this migration exists to close) — confirmed exactly 1 `Person` existed before B7's migration, exactly 2 after, both correctly correlated by email.
- **Idempotency, tested directly**: replayed `upgrade()` a second time against the already-migrated database — `people` count held at 2, no duplicates, no errors.
- **Partial catch-up, tested directly**: added a third user *after* the migration had already run once, replayed again — exactly that one new user was backfilled; the other two were untouched.
- **Downgrade**: intentionally a no-op (documented in the migration itself) — this migration only backfills data into an already-existing table it doesn't own the schema of, and rows it inserts are indistinguishable from B1's own backfill or from rows Slice B7's own registration-time logic creates going forward. Verified it runs without error and leaves all data untouched.
- **PostgreSQL dialect check**: this migration contains zero DDL (`CREATE TABLE`/`ALTER TABLE`/defaults/constraints) — confirmed by grep — only `INSERT`/`SELECT` data operations via SQLAlchemy Core, the identical pattern B1 already used successfully against production Postgres. The dialect-compile check added after B4's incident applies to schema-bearing migrations; this one has nothing for it to catch, and that's stated here rather than silently skipped.

---

## 6. Scope discipline confirmed

| Constraint | Status |
|---|---|
| Migrating multiple endpoints | Not done — one router endpoint's underlying service function (`register_public_participant`, shared by both the canonical and legacy public registration routes, neither of which itself was touched) plus one claiming function |
| Replacing `has_permission()` globally | Not touched |
| Removing legacy authorization | Not touched |
| Changing admin authorization | Not touched — confirmed, zero diff in `authorization.py`/`dependencies.py` |
| Relationship inheritance beyond claiming | Not introduced — `PersonRelationship` is consulted only inside `claim_participants_for_user`, nowhere else |
| Cleanup/removal of compatibility code | Not done — `user_id` is written in every place it always was, unchanged |

---

## 7. Production deployment (2026-07-20)

Committed (`479664c`), tagged `v1.39.0-phase3b-b7-identity-write-path`, pushed to `origin/master`. Deploy log confirmed:

```
==> Starting pre-deploy: alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade c8f2b6a4d1e9 -> d5a9e2c7f3b1, backfill Person for any User missing one (identity foundation slice B7)
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: d5a9e2c7f3b1
   Application migration head: d5a9e2c7f3b1
   Schema status: MATCH
==> Your service is live 🎉
```

**Live sequence, run end-to-end against production:**

| Step | Result |
|---|---|
| Register a brand-new participant account | `200`, account created |
| Login | `200`, JWT issued |
| Register that participant for a real published event (`fake-event-test`) | `201`, waiver auto-issuance still working unchanged |
| `GET /api/participants/mine` | `200`, registration immediately visible with correct `waiver_status` — behavior identical to pre-B7 |

**Database verification** (run directly against production Postgres via a `psycopg2` one-liner in Render Shell — `psql` was not available in that container, and `DATABASE_URL` there is in SQLAlchemy's `postgresql+psycopg2://` form, requiring a scheme fix before `psycopg2.connect()` would accept it):

```
Query 1 (user -> person link): [('589855df-3d2c-48fa-bcbf-7afa3230311f', 'b7-live-test-...@example.com', 'd044ebc8-f101-43ce-b1df-8f864d573125', 'b7-live-test-...@example.com')]
Query 2 (duplicate check):     [('589855df-3d2c-48fa-bcbf-7afa3230311f', 1)]
Query 3 (participant person_id): [('80fc96a3-2bfa-45c9-b6d4-f8739213351c', '589855df-3d2c-48fa-bcbf-7afa3230311f', 'd044ebc8-f101-43ce-b1df-8f864d573125', 'b7-live-test-...@example.com')]
```

All four objectives confirmed directly against persisted state, not inferred from API behavior: the new `User` has exactly one corresponding `Person` (query 1, non-null); no duplicates exist (query 2, count = 1); the new `Participant.person_id` is populated (query 3, non-null); and the linkage is internally consistent — query 3's `person_id` (`d044ebc8-...`) and `user_id` (`589855df-...`) match query 1's values exactly.

## 8. Rollback path

Revert the three code changes (`auth.py`, `public_registration.py`, `participant_claiming.py`) — `user_id`-based behavior is completely untouched throughout and keeps working on its own with or without this slice's code present. Any `Person` rows, `person_id` values, or relationship-based claim audit events already created by the time of a rollback are harmless to leave in place — nothing currently reads `person_id` for any authorization or ownership decision (that remains `has_permission()`/`user_id`, unchanged), so an orphaned value is inert, not a correctness risk. The migration itself needs no rollback action beyond the no-op `downgrade()` already provided.

## 9. Conclusion

B7's two responsibilities — a real, active identity write-path transition, and a real-but-currently-dormant relationship-aware claiming path — both held to their intended scope exactly, proven via 13 new tests plus the same migration rigor established since B1. `user_id`/`has_permission()`/admin authorization are byte-for-byte unchanged. **Deployed to production 2026-07-20 and validated against persisted database state, not just API responses** (§7) — the strongest verification standard used in this rollout so far. Per the user's own acceptance sequence, B7 is considered fully accepted once it has also run under normal production traffic for a period with no unexpected exceptions or claim anomalies in the logs, before B8 is authorized.
