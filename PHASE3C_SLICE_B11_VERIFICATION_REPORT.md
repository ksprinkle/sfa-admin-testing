# Phase 3C — Slice B11: Verification Report

## Status
Phase: 3C — Identity Capability Transition, Slice B11
Mode: Implementation — Continuous PersonRole Issuance
Repository changes: 2 existing files edited, 3 new files (1 service module, 1 migration), 3 new/extended test files, 1 unrelated routing bug fixed in the same file B11 already touches. Matches the approved scope from `PHASE3C_SLICE_B11_ARCHITECTURE_REVIEW.md`.

## B11 Mission (as approved)

> Make PersonRole issuance continuous: grant one at registration, and keep it synchronized whenever an admin changes a user's role. Reconcile existing accounts once. No schema changes. Single-commit rollback. Do not touch capability_resolution.py, dependencies.py, or any authorization migration.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/services/person_role_management.py` (new) | `grant_person_role()` / `revoke_person_role()` — get-or-reactivate idempotent grant, safe-no-op revoke. Kept separate from `capability_resolution.py` (resolution-only) and `authorization.py` (pure mapping, no writes), per the architecture review's §7. |
| `api/routers/auth.py` | `register()`: initial `PersonRole("participant")` grant added to the same commit as `Person` (via `db.flush()` to obtain `person.id`, then one `db.commit()`). All three role-mutation endpoints: each now revokes the `PersonRole` matching `previous_role` and grants one for `new_role`, in the same transaction as the existing `user.role = new_role` write. **Also**: reordered `update_user_role_by_email` to be registered before `update_user_role` — see §2. |
| `alembic/versions/e1c4b7a9d2f6_reconcile_person_roles_with_legacy_role.py` (new) | One-time, guarded, data-only reconciliation: for every `Person`, ensures their active `PersonRole` set matches their current `User.role` exactly — closes both the "never backfilled" gap and the "stale/diverged" bug in one pass. No schema change. |
| `tests/test_person_role_management.py` (new) | 6 tests — grant/revoke idempotency, reactivation-not-duplication, safe no-op revoke. |
| `tests/test_admin_role_mutation_person_role_sync.py` (new) | 6 tests — PersonRole sync on all three role-mutation endpoints, idempotency, graceful no-op when no `Person` exists. |
| `tests/test_auth_register.py` (extended) | 2 new tests — registration grants exactly one active `PersonRole`. |

`api/services/capability_resolution.py` and `api/dependencies.py`: **untouched**, as required.

---

## 2. Unrelated bug found and fixed in the same slice

While adding test coverage for all three role-mutation endpoints (required by B11's own scope, since all three needed the `PersonRole` sync fix), discovered `PUT /admin/users/by-email/role` was **permanently unreachable** — shadowed by `/admin/users/{user_id}/role`, registered first with the identical path shape (see `KNOWN_TECHNICAL_DEBT.md`'s new postmortem entry for the full root cause). Flagged to the user directly rather than silently worked around or silently left broken; user chose to fix it within this slice, since B11 already touches this exact endpoint. Fix is a pure route-registration reordering — no behavior change to any endpoint that already worked, confirmed by the full suite showing zero new failures.

---

## 3. Transaction shape — confirmed as reviewed

`register()`'s `Person` and initial `PersonRole` grant are in the same commit (`db.flush()` obtains `person.id` without ending the transaction; `db.commit()` covers both). This eliminates "Person exists, PersonRole doesn't" as a reachable state from registration, exactly as the architecture review's §4 specified. The verification-email step remains its own, separate try/except/commit — unchanged, since that's the one step with a real external dependency (SMTP).

## 4. Idempotency — proven directly

`test_grant_is_idempotent_no_duplicate_row` and `test_grant_reactivates_a_revoked_row_instead_of_inserting` (both in `test_person_role_management.py`) prove the get-or-reactivate behavior the unique constraint on `(person_id, role_code)` requires — a repeated grant neither raises an `IntegrityError` nor creates a second row. `test_role_change_is_idempotent_when_setting_the_same_role_again` proves the same property through the actual admin endpoint.

## 5. Role synchronization — proven against the exact divergence bug

`test_role_change_revokes_stale_person_role_and_grants_new_one` constructs precisely the scenario `KNOWN_TECHNICAL_DEBT.md` flagged after B10's review: an account already has an active `PersonRole` disagreeing with the role about to be set. After the endpoint runs, the stale grant is revoked and the correct one is active — this bug is now closed for every account whose role is changed after this slice ships.

## 6. Reconciliation migration — verified against the full checklist

Verified manually (this project has no committed migration test files for B1/B3/B4/B7 either — same established practice, not a new gap):

| Check | Result |
|---|---|
| Clean upgrade on empty database | Pass — zero rows produced, no error |
| Clean upgrade on populated database (three scenarios: missing grant, already-correct grant, stale/diverging grant) | Pass — missing case granted, correct case left untouched, stale case revoked and the correct role reactivated |
| Idempotent replay | Pass — re-running `upgrade()` against an already-reconciled database produced zero additional changes |
| Partial catch-up (a new user added after the first run) | Pass — the new user was picked up correctly on a second run, without disturbing already-reconciled rows |
| Clean downgrade | Documented no-op (same honest pattern as `d5a9e2c7f3b1`'s downgrade) — nothing to safely reverse, since the rows this migration touches are indistinguishable from ones created by continuous issuance or B3's original backfill |
| PostgreSQL dialect DDL compile check | **N/A** — this migration contains zero DDL (no `create_table`/`add_column`/`create_index`), only data reads/writes against already-existing tables, so there is nothing to compile. Marked explicitly rather than silently skipped, per the architecture review's own note. |

## 7. Full test suite

`PYTHONIOENCODING=utf-8 python -m unittest discover tests`: **172 tests (159 pre-existing + 13 new — 6 in `test_person_role_management.py`, 6 in `test_admin_role_mutation_person_role_sync.py`, 2 added to `test_auth_register.py`, minus 1 net from no removals), 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures**, including after the routing fix (which touched a fourth existing endpoint, `update_user_role`, only by moving its registration point, not its logic).

## 8. No schema change

Confirmed — the new migration is data-only; `person_roles` already had every column this slice needed (added in B3).

## 9. Rollback

Revert the single commit touching `api/routers/auth.py` and the new `api/services/person_role_management.py`. Registration and role-mutation endpoints return to writing only `User.role`; any `PersonRole` rows already granted by this slice's code, or by the reconciliation migration, are harmless to leave in place — indistinguishable from B3's original backfill. The reconciliation migration's own rollback is the same honest no-op as B7's gap-window migration.

---

## 10. Production deployment (2026-07-21)

Committed (`eabc808`), tagged `v1.43.0-phase3c-b11-person-role-issuance`, pushed to `origin/master`. Deploy log confirmed the reconciliation migration ran for real this time:

```
==> Starting pre-deploy: alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade d5a9e2c7f3b1 -> e1c4b7a9d2f6, reconcile PersonRole with legacy User.role (identity capability transition slice B11)
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: e1c4b7a9d2f6
   Application migration head: e1c4b7a9d2f6
   Schema status: MATCH
==> Your service is live 🎉
```

**Live validation:**

| Check | Method | Result |
|---|---|---|
| Clean startup | Deploy log | No errors, service live |
| Reconciliation migration ran | Deploy log | `Running upgrade d5a9e2c7f3b1 -> e1c4b7a9d2f6` — real execution, not skipped |
| Schema status | Deploy log | `MATCH` |
| Registration grants a real `PersonRole` | Fresh throwaway participant account → `GET /api/auth/me` | `200`, `capabilities: ["participants.view_own","waivers.view_own"]` |
| **`PersonRole` row actually exists (not just resolving via fallback)** | Direct Render Shell query on the new account | `[('participant', 'active', datetime(2026, 7, 21, 23, 52, 26, ...))]` — confirms continuous issuance is real, the one fact no API response could show |
| `GET /api/participants/mine` unaffected | Same account | `200`, `[]` |
| Route-ordering fix works | Admin changed a test account's role via the now-reachable `PUT /admin/users/by-email/role` | Role updated as expected — confirms the fix, previously silently broken |
| Log check | Application Logs, this deploy window | No registration failures, role-update failures, migration anomalies, duplicate `PersonRole` rows, or integrity constraint violations |
| Admin regression | Confirmed directly | Dashboard, Executive Dashboard, and Communications all load normally |

Every check matches expected behavior exactly.

## 11. Conclusion

B11 makes `PersonRole` issuance continuous for the first time since B3's one-time backfill: every new registration is capability-native from birth, every admin role change keeps both fields synchronized, and the reconciliation migration closes both known gaps (missing and stale grants) for every existing account in one pass. `api/services/capability_resolution.py` and `api/dependencies.py` required zero changes — the fifth slice in a row confirming B5's abstractions are sound. One unrelated, previously-undiscovered routing bug was found and fixed transparently within scope, per the user's explicit choice.

**Deployed to production 2026-07-21 and validated live** (§10). **Status: Production validated; observation window in progress.**
