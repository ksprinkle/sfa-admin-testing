# Phase 3C — B13: Relationship-Aware Ownership Resolution — Architecture Review

> **Status:** Architecture review only. No implementation authorized.
> **Supersedes:** `PHASE3C_SLICE_B13_ARCHITECTURE_REVIEW.md` (the retired "person_id read-path migration"), per the user's explicit redefinition.
> **Baseline reviewed against:** `v1.44.0-phase3c-b12-participant-person-reconciliation`.

This document answers the eight review questions posed, grounded directly in the existing `Person`/`PersonRelationship`/`Household`/`capability_resolution.py` infrastructure — most of which was built in B4/B5 with exactly this eventual feature in mind, then left deliberately dormant. The central finding: **this feature doesn't need new schema or a new engine — it needs its own already-reserved extension point in `capability_resolution.py` finally activated**, plus a creation lifecycle for `PersonRelationship` that has never existed.

---

## 1. Ownership Resolution Model

**Recommendation: extend the existing Capability Resolution Engine, don't build a parallel one.**

`api/services/capability_resolution.py` already has the exact shape this needs, unused since B5:

```python
def _resolve_relationship_capabilities(
    db: Session, *, actor_person: Person | None, target_person_id: UUID | None
) -> set[str]:
    """...Returns an empty set unconditionally - deciding which flag maps
    to which permission string is an explicit, later slice's job, not this one's."""
```

B5 built this signature — `actor_person` + `target_person_id` → a set of granted permission strings — specifically so a later slice could implement it without touching anything else. That later slice is this one. A new capability string, e.g. `participants.manage_related`, would be added to the resolution result whenever an active, `can_register_for` `PersonRelationship` exists from the actor to the target. This is architecturally identical to how `participants.view_own` already works for the direct-ownership case — same engine, same call shape (`resolve_capabilities(db, user=caller, target_person_id=...)`), just a second capability string that can now actually be granted.

**Inputs**: `db: Session`, `caller: User` (or their `Person`), and either a single `target_person_id` (record-level check) or nothing (set-level query — see §6, since a per-record call doesn't scale to a list endpoint).
**Outputs**: for the record-level check, a boolean (via `has_capability()`, already exists); for the list case, a **set of `person_id`s the caller may manage** — a new function, `resolve_manageable_person_ids(db, user) -> set[UUID]`, living alongside the existing (also-dormant) `resolve_household_ids_for_person()` helper in the same module.
**Responsibility boundary**: this answers *"which records may this caller manage"* only. It does not decide whether the caller's role/capability-gate lets them reach the endpoint at all (still `require_capability()`, B9/B10, untouched) and does not touch response shaping. Two questions, two layers — same separation B9/B10 already established between "can you reach this endpoint" and "which rows do you see."
**Centralization**: yes — this becomes the one place either ownership question is answered, called by both functions in `participant_identity.py` and reusable by anything built later (a future "manage waiver on behalf of" flow, for instance).

---

## 2. Relationship Semantics

Already fully specified by B4's model (`api/models/person_relationship.py`), not something this review needs to invent:

- `relationship_type` — free-text descriptive label ("parent", "legal_guardian", "caregiver", "spouse", "other"). **Not** used to derive authority — this was B4's explicit, load-bearing design choice (two `relationship_type="grandparent"` rows can carry different flags), reaffirmed in the roadmap's §0 refinements.
- Five independent capability flags exist: `can_register_for`, `can_view_documents`, `can_manage_documents`, `can_receive_communications`, `is_emergency_contact_only`.

**Which flags grant registration/ownership authority, for this feature specifically**: only `can_register_for`, on a `status="active"` row. This is not a new decision — it's the exact gating condition `participant_claiming.py`'s Pass 2 already uses today for claiming. The other four flags describe *different*, separate future capabilities (document visibility, communications routing, an emergency-contact-only relationship that should explicitly **not** grant management access) and are out of scope for ownership resolution.

---

## 3. Relationship Creation Lifecycle

Nothing creates a `PersonRelationship` row anywhere in this codebase today (confirmed — B4 introduced the table with zero backfill/inference, deliberately, and nothing since has changed that). This is the one genuinely new piece of infrastructure this feature requires.

**Recommended design, scoped to what a first implementation actually needs:**

- **Who may create one**: admin-only, initially. Every other identity-adjacent action in this rollout that needed a first, trusted actor started admin-only before any self-service version was considered (B7's registration-time `Person` creation, B11's role grants). A participant-initiated "invite my spouse" flow is a legitimate future direction but adds meaningfully more surface (invitation tokens, email delivery, acceptance UI) — explicitly out of scope for this slice.
- **Verification**: the model already has `verified_at`/`verified_by_user_id` — fields B4 added with exactly this in mind, never used. Recommend admin-created = admin-verified at creation time (`verified_at = now()`, `verified_by_user_id = creating_admin.id`), the same trust model this project already extends to every other admin-performed action. No separate approval workflow needed for a first implementation; a self-service "request, then approve" flow (which would need a genuine pending state the model doesn't have yet) is a clean future extension, not a blocker now.
- **When active**: immediately on creation (`status="active"`), since admin-only creation removes the need for a separate activation step.
- **Modification/revocation**: mirror B11's `person_role_management.py` shape exactly — a small, analogous service (e.g. `api/services/person_relationship_management.py`) with idempotent grant/revoke semantics reusing the same "get-or-reactivate" pattern proven in B11.
- **Audit**: reuse `record_admin_audit_event()` exactly as every other admin-initiated identity change already does (B7's claiming, B11's role mutations) — new domain (e.g. `"relationships"`), actions like `person_relationship_created`/`_revoked`.
- **Admin workflow**: new admin-only endpoints (e.g. `POST /admin/people/{person_id}/relationships`, a revoke endpoint), matching the existing admin router conventions (`require_admin`, its own schema file).
- **Participant-facing future possibility**: explicitly staged, not built now. The data model already supports evolving into it later (the `verified_at`/`verified_by_user_id` fields exist for exactly that) without any schema change — this review just doesn't propose building it yet.

---

## 4. Ownership Resolution Rules — the canonical policy

```
A caller may manage Participant P if, and only if:

  1. P.person_id == caller's own person_id                              (direct/self)
     OR
  2. an active PersonRelationship exists where:
       subject_person_id  == caller's own person_id
       related_person_id  == P.person_id
       can_register_for   == True                                       (delegated)
```

**Why this provably preserves today's behavior** (the review's "current production behavior is preserved" goal, made concrete rather than asserted): B12's reconciliation already established that, for every row in production that doesn't involve a relationship claim, `person_id` and `user_id` identify the same person. Rule 1 is exactly the "no relationships exist" case — and since relationship-based claiming has never fired in production (confirmed at B7, B10, and again here), rule 1 alone reproduces today's `user_id`-based result **exactly**, for every row that exists right now. Rule 2 only ever adds rows — it can't remove access anyone has today, and it only starts mattering the day a real `PersonRelationship` is created, which is precisely the capability this whole model exists to enable.

Future delegated-authority models (household-wide access, time-limited delegation) are explicitly out of scope — rule 2 covers exactly the `can_register_for` relationship case B7 already built the claiming side of.

---

## 5. Service Boundaries

Confirmed unchanged from the B12/retired-B13 review: exactly two functions, one file (`api/services/participant_identity.py`: `list_own_registrations()`, `get_own_participant_or_404()`), do ownership-scoping reads anywhere in this codebase. Both should call the one new centralized resolution function (§1); neither should construct its own ownership query. No admin router, no other service, does anything ownership-related today — confirmed by the same full-codebase trace done for the retired B13 review.

---

## 6. Query Strategy

**Hybrid, and the shape falls out naturally from §1/§4**: resolve the caller's full "manageable `person_id` set" once per request — the caller's own `person_id`, plus every `related_person_id` from their active, `can_register_for` `PersonRelationship` rows (one small join query, bounded by how many relationships one person realistically has — not a scale concern worth pre-optimizing) — then use that set directly in SQL:

- List endpoint: `Participant.person_id.in_(manageable_person_ids)`.
- Single-record endpoint: `participant.person_id in manageable_person_ids` (or the equivalent `EXISTS`/`IN` at the SQL level for the 404 path).

This avoids resolving ownership per-row (no N+1), keeps exactly one function as the authoritative decision point (§5's goal), and requires no caching or precomputation — household/relationship counts per person are small enough that premature optimization here would be exactly that.

---

## 7. Validation Strategy

Not query-equivalence between two columns (the retired B13's now-inapplicable bar) — validation that the new **policy** behaves as intended, mirroring the dual-implementation equivalence-report standard already used at B3/B5:

| Scenario | Expected |
|---|---|
| Caller with no relationships at all | Sees exactly what `user_id`-based access shows today — the regression case, provable via §4's argument and enforced by running the existing, unmodified `tests/test_participant_identity.py`/`tests/test_my_registrations.py` suites against the new resolution path |
| Guardian, one child, active `can_register_for` relationship | Guardian sees the child's registration; if the child also has their own account, they see it too (both rules can independently grant the same row) |
| Guardian, multiple children | Guardian sees all children they have an active, `can_register_for` relationship with — not others' |
| Mixed ownership (own registration + a child's) | Both appear; a third, unrelated user sees neither |
| Relationship exists but `can_register_for=False` | No access — confirms the flag, not the row's mere existence, gates authority |
| Relationship `is_emergency_contact_only=True` | No access — confirms this flag is a different capability, not a synonym for registration authority |
| Revoked relationship (`status="revoked"`) | Access is removed the moment status flips — mirrors B11's own revoke-then-check test pattern |
| Household grouping present vs. absent | Irrelevant to registration authority either way — `Household` is "never an owner," purely a label per its own model docstring |
| Full regression | `tests/test_participant_identity.py` and `tests/test_my_registrations.py` pass **unmodified** — the strongest available proof of backward compatibility, the same bar B10 already met |

---

## 8. Rollback / Incremental Rollout

**Recommend repeating the B6 playbook before any cutover** — this project already has a proven pattern for introducing a new decision-maker safely: ship the new resolution function computing an answer, log on disagreement with today's `user_id`-based result, never act on it. Since relationship data is provably zero in production today, the shadow-check would show zero mismatches until the day a real relationship is created — at which point the shadow log becomes the *first real signal* the new capability is actually being exercised, and only then would switching the real read path over be considered (mirroring B9's own gate: direct replacement conditioned on a clean shadow-check history).

Every piece of this remains single-commit-revertible and additive: relationship creation endpoints can be removed without touching `Participant` rows; the shadow-check can be removed without touching the live read path; the eventual cutover is the same one-file, one-function change shape every prior slice in this rollout has had.

---

## Proposed sequencing (for consideration, not authorization)

Distinguishing exactly the four things the "Expected Outcome" asks to keep separate:

| Sub-slice | What it is | Depends on |
|---|---|---|
| **B13a** | Relationship creation lifecycle: admin-only create/revoke endpoints, `person_relationship_management.py`, audit events | Nothing new — schema (B4) already exists |
| **B13b** | Ownership Resolution Engine: activate `_resolve_relationship_capabilities()` for real, add `resolve_manageable_person_ids()` | B13a (needs real relationships to be meaningfully testable end-to-end, though the function itself can be built and unit-tested against synthetic fixtures first) |
| **B13c** | Shadow-check integration into `participant_identity.py` (observe-only, B6-style) | B13b |
| **B13d** | Cutover: `participant_identity.py` actually reads through the new resolution function | B13c's clean observation window |
| **Future** | Retirement of `Participant.user_id` as the ownership signal | B13d proven stable in production |

Each of these is independently reviewable and deployable, consistent with this project's sequencing principle. This review does not authorize any of them — it's the design this rollout's next review-then-implement cycle would work from, whenever brought forward.

---

## Summary of what needs the user's decision

1. Accept extending `capability_resolution.py`'s existing dormant Relationships layer (§1) rather than building a separate ownership module.
2. Accept `can_register_for` as the sole authority-granting flag for this feature (§2); the other four flags stay reserved for later, unrelated capabilities.
3. Accept admin-only relationship creation with immediate verification (§3) as the first implementation, with self-service creation explicitly deferred.
4. Accept the two-rule ownership policy (§4) and its backward-compatibility argument.
5. Accept the proposed B13a–B13d sub-sequencing (or a different breakdown) before any implementation is authorized — each sub-slice would still need its own go-ahead, per this project's standing one-slice-at-a-time practice.

No code has been written.
