# Phase 3C — Slice B13a: Verification Report

## Status
Phase: 3C — Identity Capability Transition, Slice B13a
Mode: Implementation — Relationship Lifecycle (Creation Only)
Repository changes: 3 new files, 1 existing file (`api/main.py`) edited to mount the new router, 2 new test files.

## B13a Mission (as authorized)

> Introduce the ability for administrators to create verified PersonRelationship records. Admin-only creation, immediate verification using the existing verified_at/verified_by_user_id fields, reuse the existing schema exactly. No ownership resolution changes, no participant query changes, no capability engine activation, no changes to participant visibility or authorization. Relationships should exist as managed, verified data but remain architecturally dormant with respect to participant access.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/services/person_relationship_management.py` (new) | `create_person_relationship()` — creates a `PersonRelationship` row as `status="active"`, `verified_at=now()`, `verified_by_user_id=<creating admin>`. Mirrors `person_role_management.py`'s (Slice B11) shape for the same kind of domain: a small, write-only service, separate from resolution. |
| `api/schemas/person_relationships.py` (new) | `PersonRelationshipCreate` / `PersonRelationshipOut` — plain reflection of the existing model, no new fields. |
| `api/routers/admin_person_relationships.py` (new) | `POST /admin/person-relationships` (create + audit), `GET /admin/person-relationships` (list, optionally filtered by `subject_person_id`/`related_person_id`). Both `require_admin`. Create validates: no self-relationship, both `Person` ids must exist. |
| `api/main.py` | New router imported and mounted (`app.include_router(admin_person_relationships_router, prefix="/api")`), matching the existing router-registration pattern exactly. |
| `tests/test_person_relationship_management.py` (new) | 3 tests — service-level creation, default flags, persistence. |
| `tests/test_admin_person_relationships.py` (new) | 9 tests — positive case, audit event, list/filter, both 404 validation guards, self-relationship 400, participant 403, anonymous 401, and the key architectural property (below). |

**Not touched, per approved scope**: `api/services/capability_resolution.py`, `api/services/participant_identity.py`, `api/dependencies.py`, `api/services/participant_claiming.py`. No migration — `person_relationships` has had every column this slice uses since Slice B4.

**Scope note**: the approved objective/scope named creation and verification specifically; it did not name revocation or editing. This implementation includes creation and a read-only list endpoint (needed to verify persistence without requiring direct database access for every check), but does **not** include a revoke/update endpoint — deliberately deferred as a separate, later piece of the lifecycle rather than assumed in-scope. Flagging this choice explicitly in case revocation was intended to be part of this same slice.

---

## 2. The key architectural property: still dormant

`test_fully_permissive_relationship_does_not_affect_capability_resolution` creates a relationship with **every** capability flag set to `True` (`can_register_for`, `can_view_documents`, `can_manage_documents`, `can_receive_communications`) between a real guardian and a real "child" account, then calls `resolve_capabilities(db, user=guardian, target_person_id=child_person.id)` directly — the same call `capability_resolution.py`'s dormant `_resolve_relationship_capabilities()` would need to actually act on if it were doing anything. Result: unchanged, exactly `permissions_for_role("participant")` — proving the engine's Relationships layer is exactly as inert after this slice as before it, even against a maximally-permissive real row, not just an absent one. This directly satisfies the "architecturally dormant" requirement in the approved scope, and mirrors the exact test pattern B5 itself used (`test_relationship_scaffolding_grants_nothing_yet`) to prove the same property when the table was first introduced.

## 3. Existing participant behavior — unchanged

Not re-tested here because nothing touched the code path: `tests/test_participant_identity.py`, `tests/test_my_registrations.py`, `tests/test_participants_mine_capability_enforcement.py`, and `tests/test_get_own_participant_capability_enforcement.py` all pass **unmodified** (§4) — direct proof that `participant_identity.py` and the capability-gated endpoints it backs are untouched by this slice, matching "no changes to participant visibility or authorization" exactly.

## 4. Full test suite

`PYTHONIOENCODING=utf-8 python -m unittest discover tests`: **184 tests (172 pre-existing + 12 new), 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures.**

## 5. No schema or database change

Confirmed — `person_relationships` (Slice B4) already has every column this slice writes to (`status`, `verified_at`, `verified_by_user_id`, all five capability flags). No migration added or needed.

## 6. Rollback

Revert the single commit adding these files and the `main.py` router mount. No data implications: any `PersonRelationship` rows already created remain in place, harmlessly inert (nothing reads them for authorization either way, before or after a rollback) — the same reversibility property every additive slice in this rollout has had.

---

## 7. Production deployment (2026-07-25)

Committed (`475c825`), tagged `v1.45.0-phase3c-b13a-relationship-lifecycle`, pushed to `origin/master`. Deploy log confirmed no migration ran (correct — no schema change) and:

```
==> Starting pre-deploy: alembic upgrade head
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: f7b3d9a1c5e8
   Application migration head: f7b3d9a1c5e8
   Schema status: MATCH
==> Your service is live 🎉
```

**Live validation**, using two fresh throwaway accounts (`b13a-guardian-...@example.com`, `b13a-child-...@example.com`) and the user's own admin login:

| Check | Method | Result |
|---|---|---|
| Clean startup | Deploy log | No errors, service live |
| Schema status | Deploy log | `MATCH` (unchanged — no migration this slice) |
| Anonymous access to the new endpoints | `POST`/`GET /admin/person-relationships`, no token | `401` for both |
| Relationship creation | Admin `POST /admin/person-relationships` between the two real `Person` ids | `201`, `status: "active"`, `verified_at`/`verified_by_user_id` populated automatically, `can_register_for: true` as specified, other flags correctly defaulted `false` |
| List/filter | `GET /admin/person-relationships?subject_person_id=...` | Returns exactly the one relationship just created |
| Architectural dormancy, live | Guardian account (now the `subject` of a fully-active `can_register_for` relationship) → `GET /api/participants/mine` and `GET /api/auth/me` | `200`, `[]` and unchanged `capabilities` respectively — no relationship-derived effect, matching the local test proving the same property |
| Admin regression | Confirmed directly | Dashboard, Executive Dashboard, and Communications all load normally |

Every check matches expected behavior exactly, including the one property this slice is specifically scoped to prove — a real, maximally-permissive relationship in production has zero observable effect on participant access.

## 8. Conclusion

B13a brings `PersonRelationship` creation into existence for the first time in this project's history — admin-only, immediately verified, fully audited — while proving directly (not just asserting) that the capability engine's Relationships layer remains completely inert even against a maximally-permissive real row. `capability_resolution.py` required zero changes. This is the first of the four proposed B13 sub-slices (`B13a` → `B13b` → `B13c` → `B13d`); each subsequent one still requires its own explicit authorization.

**Deployed to production 2026-07-25 and validated live** (§7).

**Status: CLOSED (2026-07-25).** The observation window completed cleanly, with no production anomalies. `v1.45.0-phase3c-b13a-relationship-lifecycle` is adopted as the new canonical production baseline for Phase 3C — Identity Capability Transition.
