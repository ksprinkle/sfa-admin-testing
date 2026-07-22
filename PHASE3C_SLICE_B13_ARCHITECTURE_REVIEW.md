# Phase 3C — Slice B13: Architecture Review

> **Status:** Review only. No implementation. Answers the questions posed for B13 — the actual `Participant.person_id` read-path switch — against the current codebase.
> **Baseline reviewed against:** `v1.44.0-phase3c-b12-participant-person-reconciliation`.

## 0. Verdict, up front

**A straight column swap (`Participant.user_id == caller.id` → `Participant.person_id == caller_person.id`) is not safe, and not because of a data gap this time — because of what the two columns actually mean.** `user_id` and `person_id` are not two names for the same fact. For every row created by direct self-registration or an exact-email claim, they happen to identify the same real person, so a swap looks equivalent against today's data. But `api/services/participant_claiming.py`'s relationship-based claiming pass (Slice B7 Part 2, real code, currently zero live rows) deliberately sets `user_id` to the **claiming guardian** while leaving `person_id` pointing at the **registrant** (e.g., a child) — by design, per that code's own comment: *"person_id is intentionally left as-is: it already identifies the actual registrant, not the claiming account."*

That means `person_id` answers *"whose registration is this,"* while `user_id` answers *"who may access this row,"* and today those two questions have different answers the instant relationship-based claiming produces a real row. A caller who reached ownership only through a relationship claim would **lose access to a registration they legitimately claimed** under a naive `person_id`-based query — silently, the day someone actually creates a `PersonRelationship` row (a capability that already exists in this codebase, just unused so far).

This is a materially different kind of finding than B10's or B12's gaps (both were *incomplete data*, closable by a backfill). This is a *semantic mismatch between two columns that were never meant to answer the same question* — no reconciliation migration fixes it, because there's nothing wrong to reconcile; the code is doing exactly what B7 designed it to do.

**This review does not recommend proceeding with a read-path swap as originally scoped.** §7 lays out the options.

---

## 1. Query Equivalence — where it holds, and where it provably doesn't

Both ownership functions in `api/services/participant_identity.py` currently key on `Participant.user_id`:

```python
# list_own_registrations()
.filter(Participant.user_id == current_user.id, Participant.removed_at.is_(None))

# get_own_participant_or_404()
if participant is None or participant.user_id is None or str(participant.user_id) != str(current_user.id):
```

Tracing every place `person_id` gets set on a `Participant` row (`api/services/public_registration.py`, `api/services/participant_claiming.py`):

| How the row came to have `user_id` set | Is `person_id` the same identity as `user_id`? |
|---|---|
| Direct self-registration (`public_registration.py`) | **Yes** — both set to the registering user's own identity in the same call |
| Exact-email claim, Pass 1 (`participant_claiming.py`) | **Yes** — both set to the verifying user's own identity |
| **Relationship-based claim, Pass 2** (`participant_claiming.py`) | **No** — `user_id` = the claiming guardian; `person_id` = the registrant (e.g. a child), by explicit design. The query that finds these rows (`PersonRelationship.related_person_id == Participant.person_id`) *requires* `person_id` to already point at someone other than the claimant for the join to mean anything. |

**Production reality today**: Pass 2 has zero live trigger rows (`PersonRelationship` has zero rows in production — confirmed at B4 and unchanged since; B7's own verification report calls this pass "real, tested code with no live trigger condition today"). So **for every row that exists in production right now, the two columns agree**, and a query-level equivalence test against today's actual data would pass cleanly. That's real, but it's not the same claim as "these columns are interchangeable" — it's "the one case where they diverge hasn't happened yet."

**This is not a hypothetical risk.** The code that creates the divergence is already merged, tested, and deployed (B7). Nothing else needs to ship for it to start mattering — only someone creating a `PersonRelationship` row with `can_register_for=True`, which is a capability this codebase already has and could be exercised by a future slice, an admin tool, or even direct data entry, with zero connection to B13 itself.

---

## 2. Scope

Confirmed unchanged from the B12 review — exactly two functions, one file, do ownership-scoping reads on `Participant.user_id`: `list_own_registrations()` and `get_own_participant_or_404()`, both in `api/services/participant_identity.py`, backing `GET /participants/mine` and `GET /participants/{participant_id}` respectively (both already capability-gated by B9/B10 — this slice is entirely about the row-level filter underneath that gate, not the gate itself). No other production code reads `Participant.user_id` for ownership purposes.

---

## 3. Behavioral preservation — where it breaks

- **Response payloads**: unaffected either way — neither `user_id` nor `person_id` is ever serialized to a client.
- **Authorization (the capability gate)**: unaffected either way — B9/B10 already migrated that layer; this slice only ever touches the row-level filter underneath it.
- **Ownership semantics**: **this is exactly what breaks** for the relationship-claim case (§1). "Ownership" today means "rows this account may see," which correctly includes rows claimed on behalf of someone else. A `person_id`-only filter redefines ownership as "rows identifying this account's own canonical identity," which is a narrower, different definition — one that happens to coincide with today's definition only because the broader case has no live data yet.

---

## 4. Why this wasn't caught by B12's reconciliation, and won't be caught by any reconciliation

B12 fixed rows where the write path *failed to record data it meant to record* (a `Person` lookup came back empty at write time). This is different: the write path in Pass 2 **is recording exactly what it intends to record** — `person_id` pointing at the registrant is correct and desired for identity purposes. There's no "wrong" value to reconcile; the column is doing its job. The mismatch only becomes a problem because B13 proposes reusing this column for a second purpose (access control) that it was never designed to serve for this specific claiming path.

---

## 5. Rollback, if a swap were attempted anyway

Same shape as every prior slice: single-commit revert, no schema change, no data implications. Rollback risk was never the concern here — the concern is that the *forward* direction changes behavior in a way that regression tests against today's production data cannot catch, because the regressing case has no data to regress yet.

---

## 6. Validation — why status-code and even query-equivalence-against-today's-data testing both fall short here

Per the user's own elevated bar, query-level equivalence testing (not just endpoint status codes) was already the right instinct — but §1 shows *even that bar can pass today and still be wrong*, because the one scenario that would fail (relationship-based claim) has no rows to test against in production, and a synthetic fixture proving the divergence (easy to write — see B5's and B7's own equivalence-test style) would prove the swap is **unsafe**, not safe. This is the opposite of B3/B5's equivalence reports, which used synthetic fixtures to prove two paths **agree**; here, the honest fixture proves they **must disagree** for the relationship-claim case to work as designed.

---

## 7. Options, not a recommendation to implement

This is a genuine fork, not an implementation-detail decision — presented for your call:

**Option A — Do not migrate this read path. Retire the idea that `Participant.user_id` should ever stop being the ownership key.** Recognize `person_id`'s actual role for this table: identifying the canonical registrant for purposes *other* than access control (cross-referencing, future Phase 4 document work, analytics) — not a substitute for `user_id` here. This would mean the roadmap's "Future — legacy field retirement" item needs a correction: `Participant.user_id` may need to stay permanently, not just until B12/B13 land — a materially different conclusion than the roadmap currently states.

**Option B — Redefine what "B13" means: build real relationship-aware ownership**, e.g. `Participant.person_id == caller_person.id OR Participant.person_id IN (persons the caller has an active, can_register_for relationship with)`. This is not a read-path migration — it's a new feature (the first real consumer of `PersonRelationship` for anything beyond claiming), needs its own full architecture review, and only becomes meaningful once something actually creates `PersonRelationship` rows (no such flow exists yet either — see the original Phase 3A/3B roadmap's own acknowledgment that relationship-creation was deliberately deferred).

**Option C — Ship the narrow swap now, with a hard, explicit dependency recorded**: since production has zero relationship-claims today, the swap is safe *at this instant*. Document in `KNOWN_TECHNICAL_DEBT.md` and the roadmap, as a **blocking prerequisite** rather than a note, that this swap must be revisited (likely reverted to a union query, per Option B) before or alongside any future slice that builds relationship creation — in either shipping order, the gap between them is a live regression window for guardian access.

This review does not pick one of these for you — each has different consequences for the roadmap's "Future" retirement item and for how much this identity model can actually deliver on its original promise (guardians managing dependents' registrations under their own account, `PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md`'s founding goal).

---

## 8. Summary of what needs the user's decision

1. Confirm the finding in §1/§4: `person_id` and `user_id` are not interchangeable for `Participant` once relationship-based claiming produces real rows, and this isn't a data-completeness problem B12-style reconciliation can fix.
2. Choose among Options A/B/C in §7 (or propose another), since this changes what "legacy field retirement" even means for `Participant.user_id` specifically.
3. If Option C: confirm the debt entry should be a hard blocking dependency, not an informational note.

No code has been written. Given the nature of this finding, implementation should not proceed until this fork is resolved — this is a different situation from B9–B12, where the review's job was to validate a plan; here the plan itself needs to change.
