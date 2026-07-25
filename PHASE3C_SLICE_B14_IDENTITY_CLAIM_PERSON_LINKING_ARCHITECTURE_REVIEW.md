# Phase 3C — B14: Identity Claim & Person Linking — Architecture Review

> **Status:** Architecture review only. No implementation authorized.
> **Trigger:** A production discovery during B13b/B13c validation — a parent registers a child, the child later creates their own account, and never sees the registration. Reported by the user, investigated against the actual current code (not assumed) before writing this review.
> **Baseline reviewed against:** `v1.46.0-phase3c-b13b-ownership-resolution-engine`.

This review answers three questions: what is actually happening today (grounded in the real code, not the intended design), why B13a–B13d do not fix it, and what a next slice would need to do. **Bottom line up front, since it was explicitly asked: this does not require new schema or a new architectural layer.** `Person`/`PersonRelationship`/`User` already have every field this needs. The gap is in two specific write paths that were never built to the standard the original Phase 3A design already specified — this is a correctness fix to existing write paths, sequenced as its own slice because of what it depends on, not because the model is missing something.

---

## 1. Confirmed current behavior (traced against the live code, 2026-07-25)

**The parent-registers-child scenario, step by step:**

1. A parent (an authenticated `User` with `role="participant"`) registers a child through `POST /public/events/{slug}/register` or `POST /events/{slug}/participants`, supplying the child's own name and email. Both routes call `register_public_participant()` (`api/services/public_registration.py:18-59`).
2. That function sets `participant.user_id = current_user.id` (the **parent**) and then:
   ```python
   person = db.query(Person).filter(Person.user_id == current_user.id).first()
   if person is not None:
       participant.person_id = person.id
   ```
   This looks up the **parent's own `Person`** — by `current_user.id`, not by anything in `participant_in` (the child's actual name/email) — and stamps it onto the child's `Participant` row. **No `Person` is ever created for the child at this point.** The only `Person` touched anywhere in this flow is the parent's.
3. Later, the child creates their own account via `POST /auth/register` (`api/routers/auth.py:38-93`). This unconditionally creates a **new** `User` and a **new** `Person` (`Person(email=user.email, user_id=user.id)`, line 63) — with **no lookup against any existing `Person` or `Participant` by email first**. `Participant` isn't even imported in `auth.py`.
4. `claim_participants_for_user()` (`api/services/participant_claiming.py:27`) only runs when the child later verifies their email (`account_verification.py:163`, triggered exclusively from `POST /auth/verify-email/confirm`) — not at registration or login. Its Pass 1 (exact-email match) only considers `Participant.user_id IS NULL`. The original row is not `NULL` — it's already the parent's `user_id`, set in step 2 — so it is permanently excluded from Pass 1, regardless of what the child does afterward. Pass 2 (relationship-based) requires `Participant.person_id` to point at someone the claiming person has a `can_register_for` relationship *to* — but `person_id` here is the **parent's** `Person` (step 2), not the child's, so Pass 2 can't help either, even if a relationship existed.

**Net effect:** once a parent registers a child under the child's own email, that `Participant` row is permanently locked to the parent's `user_id` and (incorrectly) labeled with the parent's `person_id`. Nothing in the current codebase — not Pass 1, not Pass 2, not B13b's `resolve_manageable_person_ids()` — ever gives the child visibility into their own registration, no matter what account they create or verify.

## 2. Why this isn't a bug in B13a/B13b, and why B13c/B13d won't fix it either

This is not a regression introduced by B13a or B13b — both are exactly as scoped and both are inert with respect to this flow. The actual defect is older: `register_public_participant()`'s `person_id` assignment (Slice B7, well before B13) never implemented the subject-identity behavior the design called for. Quoting the original design directly — `PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md` §2.2 (never implemented this way):

> 2. **Registered by someone else** — a guardian fills out a registration form for a child; a `Person` is created for the child with no `User` attached, and a `PersonRelationship` links the guardian's `Person` to the child's.
> 3. **Later self-claiming** — ... when a new `User` is created whose email matches a `Person`'s stored email ..., attach the `User` to the *existing* `Person` rather than creating a duplicate.

Neither half was built. B7 shipped a shortcut (stamp the registrant's own `person_id`) instead of case 2's actual design, and `/auth/register` still does case-1-only unconditional creation with no case-3 check.

**Critically, B12's reconciliation migration's own backward-compatibility argument is not violated by this bug** — it's a narrower claim than it might sound. B12 confirmed `person_id` and `user_id` "identify the same person, for every row that doesn't involve a relationship claim" — and that's still true here: both fields point at the **parent** consistently. The bug is that they consistently agree on the **wrong subject**, not that they disagree with each other. B13's whole design (§4 of `PHASE3C_SLICE_B13_RELATIONSHIP_OWNERSHIP_ARCHITECTURE_REVIEW.md`) is explicitly, deliberately behavior-*preserving* — it proves the new resolution mechanism reproduces today's access exactly. **It was never scoped to fix which person a registration's identity fields actually name.** So B13c's shadow-check will show zero disagreement, and B13d's cutover will faithfully carry this exact bug forward, because reproducing today's behavior is precisely what both are designed to do. This has to be a distinct, explicit slice — no amount of finishing B13c/B13d touches it.

## 3. Does this need new schema or architecture? — No, confirmed directly

Checked both required behaviors against the existing model:

- **Creating a subject `Person` for someone other than the registrant** (Phase 3A's case 2): needs no new column. `Person.user_id` is already nullable — a "headless" `Person` (no `User` yet) is already a first-class, already-supported state; B13a's relationships already point `related_person_id` at exactly this kind of row.
- **Attaching a new `User` to an existing headless `Person`** (Phase 3A's case 3): needs no new column either. `Person.user_id` is nullable and unique — attaching is just `person.user_id = new_user.id` on an existing row instead of constructing a new one.
- **Multiple legitimate managers** (parent, guardian, participant): already fully expressed by `PersonRelationship` — no change needed. This is the part of the design that already works exactly as intended (confirmed directly by B13a/B13b).

One real (but non-blocking) schema gap worth flagging: `Person.email` is indexed but **not unique** (`api/models/person.py:31`) — the schema currently permits multiple `Person` rows sharing an email today, silently. This doesn't cause today's bug (today's bug is that a *needed* headless `Person` is never created at all, not that duplicates pile up), but it becomes relevant the moment the new slice starts matching on email, and is listed as an open decision in §6.

**Conclusion: this is a service-layer (write-path) correctness slice, not a new architectural layer.** The suspicion in the request is correct.

## 4. Does a new slice belong after B13d? — Yes

Proposed: **B14 — Identity Claim & Person Linking**, sequenced strictly after B13d.

**Why it can't run before B13d**: fixing the write path (making `person_id` correctly name the subject, and attaching new accounts to existing headless `Person`s) only matters once something actually *reads* through `person_id` + relationships for ownership. Before B13d's cutover, `Participant.user_id` is still the sole authoritative ownership signal for every real endpoint — so a corrected `person_id` would be invisible to production access decisions either way. Sequencing it after B13d also means B14 gets to validate against the real, already-live resolution engine rather than a not-yet-active one.

**Why it can't be silently folded into B13d itself**: B13d's own stated job (§4/§7/§8 of the B13 review) is a *behavior-preserving* cutover — proving the new mechanism reproduces today's result before flipping it live. Bundling a correctness fix into that slice would break the one property B13d exists to prove (no behavior change during cutover) and would make B13d's own shadow-check meaningless (it would then be checking against a moving target). Keeping them separate preserves both slices' actual guarantees.

## 5. How the flow should evolve

Two write-path corrections, plus one policy question each depends on:

**5a. Registration-on-behalf-of-someone-else** (`register_public_participant()`): when the submitted registration's email doesn't match the registrant's own email (i.e., this is Phase 3A's case 2, not case 1), stop stamping the registrant's own `person_id`. Instead:
1. Look up an existing headless `Person` (`email` match, `user_id IS NULL`) — reuse it if the same family has registered this child before (a second event, a sibling event).
2. Otherwise, create a new headless `Person` for the subject (`email`/name from `participant_in`, `user_id=None`).
3. Set `participant.person_id` to *that* `Person` — now correctly naming the subject, not the registrant.
4. Establish the registrant's delegated authority via `PersonRelationship` (`subject_person_id=registrant's Person`, `related_person_id=`the new subject `Person`, `can_register_for=True`) instead of relying on `participant.user_id` to carry that meaning going forward.

**5b. New account creation** (`/auth/register`): before unconditionally constructing a new `Person`, look up an existing headless `Person` (`email` match, `user_id IS NULL`). If found — this is exactly the case where a parent already registered this same person as a subject via 5a — attach it (`person.user_id = new_user.id`) rather than creating a second, disconnected `Person`. If not found, behave exactly as today (this remains the common case: someone registering for themselves with no prior history).

**How this achieves every property in the request:**
- *Existing participant records become associated with the correct `Person`*: 5a fixes this going forward; **existing, already-wrong production rows still need a decision** — see §6.
- *New `User` accounts attach to existing `Person`s whenever appropriate*: 5b, directly.
- *Ownership becomes relationship-based instead of user-based*: already the design B13a–B13d builds; 5a is what makes `person_id` trustworthy enough for that design to mean anything for this scenario.
- *No ownership transfer required*: correct, and this is the key structural insight — once B13d is live, "who can manage this participant" is a **computed set** (`resolve_manageable_person_ids()`: self + active `can_register_for` relationships), not a single mutable owner field. Once the child's `User` is attached to the correct `Person` (5b) and that `Person` is what the `Participant` already names (5a), the child sees it via the direct/self rule and the parent continues seeing it via the relationship rule — simultaneously, with nothing to move.
- *Multiple legitimate managers naturally work through `PersonRelationship`*: already true today for anyone reachable this way; 5a/5b just make sure the right `Person` is in that graph in the first place.

This is exactly the shape the user described as the likely outcome, and it's correct: **no new claiming mechanism is needed, no ownership transfer step is needed** — the fix is entirely about which `Person` gets named and linked at the two points identity actually gets established (registration-for-another, and new-account-creation), not about anything read-side.

## 6. What needs the user's decision

1. **Self-service `PersonRelationship` creation, expanded scope.** B13a deliberately scoped relationship creation as admin-only, with self-service explicitly deferred (`PHASE3C_SLICE_B13_RELATIONSHIP_OWNERSHIP_ARCHITECTURE_REVIEW.md` §3: *"admin-only, initially ... a self-service ... flow is a legitimate future direction but adds meaningfully more surface ... explicitly out of scope"*). 5a requires the registration flow itself to create a verified relationship at the moment someone registers for another email — this is a narrower trust boundary than a general "invite anyone" flow (it's tied to the same transactional action that already requires asserting the child's details), but it is still self-service relationship creation, which B13a explicitly punted. Needs an explicit decision: allow it (scoped exactly to "the person you just registered, at registration time"), or keep relationship creation admin-only and require an admin to backfill a relationship after the fact for every such registration (much weaker, doesn't scale to real usage).
2. **Existing, already-affected production rows.** Every `Participant` a parent has already registered under a child's email today has the same wrong `person_id`. Does B14 include a corrective data pass (find rows where `person_id` belongs to someone other than the row's own `email`/name, per some detectable signal) for existing data, or does the fix apply only to registrations from this point forward, leaving existing families to be fixed only if/when an admin manually intervenes? This materially affects whether real families currently in this state get fixed automatically or not.
3. **`Person.email` uniqueness.** Add a partial unique constraint (e.g., unique on `email` where `user_id IS NULL`) to prevent silent headless-`Person` duplication once matching-by-email becomes load-bearing for both 5a and 5b — or leave the column as-is and rely on the service-layer lookup alone? This is a schema change (small, guarded, per the project's migration standard) and is the one place this slice could touch schema, if adopted.
4. **Fuller Phase 3A split vs. minimal fix.** Phase 3A's original design (§5, quoted partially in the roadmap) proposed splitting today's single `person_id` into `person_id` (who the registration is about) and a separate `registered_by_person_id` (who submitted it) — a real schema change. §5a above achieves the same practical outcome without that new column, by using `PersonRelationship` to express "who submitted it and can still manage it" instead of a dedicated column. Confirm the no-new-column approach is preferred, or reopen the fuller split.

None of the above blocks agreeing that a new slice is warranted — they're B14's own scope questions once authorized, mirroring exactly how B13a's own admin-only-vs-self-service question was raised and decided before that slice started.
