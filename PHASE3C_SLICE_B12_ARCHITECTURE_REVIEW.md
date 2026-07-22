# Phase 3C — Slice B12: Architecture Review

> **Status:** Review only. No implementation. Answers the questions posed for B12 — migrating participant ownership read paths from `Participant.user_id` to `Participant.person_id` — against the current codebase.
> **Baseline reviewed against:** `v1.43.0-phase3c-b11-person-role-issuance`.

## 0. Correction: B11's reconciliation does not cover this gap

The request frames this review as happening "following the B11 reconciliation." That reconciliation (`e1c4b7a9d2f6`) was scoped entirely to `person_roles` — it never touched `participants.person_id` at all. Tracing the actual write paths (`api/services/public_registration.py`, `api/services/participant_claiming.py`) surfaces a **different, unreconciled gap in the exact same shape**, which is the central finding of this review — see §2.

---

## 1. Scope: every production read of `Participant.user_id`

Full inventory (`grep -r "Participant.user_id\|\.user_id" api/`, then filtering out unrelated fields):

| Location | Read | Ownership scoping, or incidental? |
|---|---|---|
| `api/services/participant_identity.py::list_own_registrations()` | `.filter(Participant.user_id == current_user.id, ...)` | **Ownership scoping** — backs `GET /participants/mine` |
| `api/services/participant_identity.py::get_own_participant_or_404()` | `if participant.user_id is None or str(participant.user_id) != str(current_user.id)` | **Ownership scoping** — backs `GET /participants/{participant_id}` |
| `api/services/participant_claiming.py` | `Participant.user_id.is_(None)` | **Incidental** — identifies not-yet-claimed rows during the *write* path (claiming), not a caller viewing their own data. Not part of this review's scope — see §6. |

No other file reads `Participant.user_id` for anything. Confirmed by direct search: `admin_participants.py` (the largest participant router, 1200+ lines) references only `removed_by_user_id`/`verified_by_user_id`/`actor_user_id` — all actor-attribution fields, a different, still-valid concern this project's ownership constraint (`PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md` §1.2) explicitly distinguishes from subject ownership. `crud/participants.py::create_participant()` doesn't touch either column at all — that's the callers' job. Neither `user_id` nor `person_id` is ever serialized into any response schema (`ParticipantOut`, `MyRegistrationOut`) — both are purely internal.

**Conclusion: exactly two functions, in one file, are the entire ownership-scoping surface this slice needs to touch.**

---

## 2. Is `Participant.person_id` actually equivalent to `user_id` for every row? — No, not yet, and this is the finding that should drive B12's sequencing

Both write paths document their own gap directly in their own comments:

- `public_registration.py:48-57`: "a `None` lookup result here (e.g. a not-yet-backfilled edge case) simply leaves `person_id` null, same as it is today."
- `participant_claiming.py`: sets `participant.person_id = person.id` only `if person is not None`.

This means: **any `Participant` row created or claimed for a user whose `Person` didn't exist yet at that exact moment has `user_id` set but `person_id` left `NULL`.** `Person` creation history has its own gap windows (B1's one-time backfill, then B7's own gap-window migration for anything created between B1 and B7) — any `Participant` created or claimed during a moment where the acting user had no `Person` yet is a candidate for this divergence. This is **the same shape of gap B10's review found for `PersonRole`** (a write path that silently no-ops when its dependency isn't ready yet), just one layer down, on `Participant` instead of `Person`/`PersonRole`.

**This has not been measured against real production data yet.** Before any read-path switch can be considered safe, this needs a direct count:

```sql
SELECT count(*) FROM participants WHERE user_id IS NOT NULL AND person_id IS NULL;
```

**Recommend running this now**, informationally, before implementation begins — not because the answer changes whether reconciliation is needed (it's needed either way, for the same reason B7 and B11's backfills were written unconditionally rather than skipped based on an assumed-empty gap), but because a non-zero count is concrete evidence of exactly how much a naive "just read `person_id` instead" change would have broken.

**Result (2026-07-22, run by the user via Render Shell): `0`.** No production `Participant` row currently has `user_id` set with `person_id` null. This doesn't remove the need for the reconciliation migration (per the reasoning above — it's built as a permanent safeguard against this gap ever reopening, not a one-off patch for a known-populated gap), but it does mean B12 will be a true no-op against today's data, and B13's eventual read-path switch inherits a clean, already-verified starting point rather than an unknown one.

---

## 3. Recommendation: two slices, not one — reconciliation, then the read-path switch

Mirroring the exact relationship between B10 (found the `PersonRole` gap) and B11 (closed it before anything depended on it), and this project's own stated sequencing principle (`PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md` §1: *"A slice that changes real behavior never ships in the same step as the schema it depends on"*):

- **B12 — `Participant.person_id` reconciliation.** A one-time, guarded, data-only migration (no schema change — `person_id` has existed since B2): for every `Participant` with `user_id` set and `person_id` null, look up the `Person` correlated to that `user_id` and backfill `person_id` from it. Same idempotent, replay-safe shape as `e1c4b7a9d2f6` (B11) and `d5a9e2c7f3b1` (B7). Zero behavior change — nothing reads `person_id` yet.
- **B13 — participant ownership read-path migration.** Only after B12's reconciliation is verified clean in production, switch `list_own_registrations()` and `get_own_participant_or_404()` from `Participant.user_id` to `Participant.person_id`.

**Why not one slice**: doing the reconciliation and the read-path switch together makes it impossible to tell, if something goes wrong, whether the problem was incomplete data or a logic error in the new query — exactly the ambiguity this project's sequencing principle exists to avoid. It also means the highest-stakes change in this entire rollout (§4) would ship in the same deploy as an unverified data assumption, rather than after it.

**Why the two read functions migrate together, not split further**: unlike B9/B10 (two independent HTTP endpoints, independently deployable), these are two small functions in one file backing the same ownership concept for the same caller — there's no independent-deployability benefit to splitting them, only extra process overhead.

---

## 4. This is the highest-stakes read-path change in the rollout so far — and why

B9 and B10 controlled *whether* a caller could reach an endpoint at all — a wrong answer there is a 403 instead of a 200, or vice versa, on an already-narrow permission gate. **B13 controls *which rows* a caller sees once they're already authorized** — a bug here could show one participant someone else's registration, or hide someone's own registration from them. That's a materially different risk shape, not just a bigger version of the same one. This justifies query-level equivalence proof, not just endpoint-level status-code checks (§7).

---

## 5. Compatibility

`Participant.user_id` keeps being written by every existing path — B12/B13 change what's *read*, never what's *written*, exactly mirroring how B3's dual-read never stopped writing `User.role`. This is also required by this project's own ownership constraint (§1.2 of the roadmap), which explicitly names `Participant.user_id` as legacy-for-backward-compatibility during this transition, not something to stop writing yet.

**Edge case the migration must define**: what happens when a caller's own `User` has no correlated `Person` at all? Per B1/B7's backfills and B11's continuous issuance, this should be effectively impossible for any account by the time B13 ships — but the read-path code must still handle it gracefully (treat as "no records"/"not found," not a `500`), the same defensive style already used throughout `capability_resolution.py`.

**Legacy compatibility after B12/B13**: still necessary. `Participant.user_id` remains the only thing several other flows depend on (claiming's unclaimed-row check, §6) and remains authoritative for any future endpoint not yet migrated. This slice narrows reliance on it; it does not retire it. Retirement is still gated on this plus B12/B13 completing, per the roadmap's "Future" item.

---

## 6. Explicitly out of scope

`participant_claiming.py`'s `Participant.user_id.is_(None)` check (finding not-yet-claimed rows to attach an account to) is a write-path precondition, not a caller-facing ownership read — migrating it isn't necessary for this slice's goal and isn't recommended here. Flagged for completeness per the review's own scope question, not proposed as work.

---

## 7. Production validation plan

**For the reconciliation migration (B12):**
- Pre-migration count (§2) for scale context.
- Standard migration checklist: fresh DB, populated DB (three scenarios — already-correct `person_id`, missing `person_id` with a resolvable `Person`, and a `user_id` with no correlated `Person` at all, which must be left alone, not crash), idempotent replay, partial catch-up, downgrade (same honest no-op as B7/B11), PostgreSQL DDL compile check (likely N/A — no DDL expected, mark explicitly rather than skip).
- Post-deploy: re-run the count query, confirm `0`.

**For the read-path switch (B13):**
- A direct query-level equivalence test (mirroring B3/B5's equivalence-report standard): construct fixture data and assert the `person_id`-based query returns the identical row set as the `user_id`-based query, across ownership/non-ownership/unclaimed scenarios.
- Endpoint-level, same shape as B9/B10: owner succeeds (`200`), non-owner denied (`404`), anonymous rejected (`401`), admin regression (`403`, unchanged).
- Direct Render Shell verification (same technique as B7/B11) confirming a real throwaway account's participant row is actually matched via `person_id`, not coincidentally via a still-correct `user_id`.

---

## 8. Expected files

| Slice | File | Change |
|---|---|---|
| B12 | New Alembic migration (`alembic/versions/<new>_reconcile_participant_person_id.py`) | Guarded, data-only. No schema change. |
| B13 | `api/services/participant_identity.py` | Both functions resolve the caller's `Person` first, then filter/compare on `Participant.person_id` instead of `Participant.user_id`. |
| B13 | New/extended tests | Query-level equivalence tests; endpoint-level regression tests (reusing `tests/test_participant_identity.py`'s existing fixtures where possible, since ownership outcomes must stay identical). |

**Not touched by either slice**: `api/dependencies.py`, `api/services/capability_resolution.py`, `api/routers/participant_self.py` (B9/B10's dependency swap is untouched — this is the layer underneath it), any write path (`public_registration.py`, `participant_claiming.py` keep writing both columns exactly as today), any admin router.

---

## 9. Deployment risk

- **B12 (reconciliation): low.** Same shape as two already-proven migrations (B7, B11). No schema change, purely additive/corrective data writes, idempotent.
- **B13 (read-path switch): moderate, and the highest of any slice in this rollout** (§4) — not because it's architecturally complex, but because a subtle bug changes *which data a caller sees*, not just *whether they're let in*. Mitigated by: B12 having already closed the data gap, query-level equivalence proof (not just endpoint-level), and the same single-commit, no-schema-change rollback shape every prior slice has had.

## 10. Rollback

Both slices: single-commit revert, no data implications. B12's rows, once backfilled, are indistinguishable from rows that were always correct — same honest non-reversal as B7/B11's downgrades. B13's revert restores the `user_id`-based queries exactly as they are today.

---

## 11. Summary of what needs the user's decision

1. Run the production count query in §2 now, informationally, before implementation begins.
2. Accept splitting this into **B12 (reconciliation)** and **B13 (read-path switch)** rather than one combined slice.
3. Accept that both functions in `participant_identity.py` migrate together in B13, not split further.
4. Accept leaving `participant_claiming.py`'s unclaimed-row check untouched (§6).
5. Accept the query-level equivalence-test bar for B13, given §4's risk assessment.

No code has been written. Awaiting your decision before any implementation.
