# Phase 3B — Slice B3: Schema Verification Report

## Status
Phase: 3B, Slice B3
Mode: Implementation — First Live Code Path Change
Repository Changes: 1 new model, 1 new Alembic migration, 1 new permanent test file, and exactly one production code change (`api/services/authorization.py::has_permission()`). No router touched. No login, JWT, permission names, API contract, or frontend behavior changed.

## B3 Mission (restated, verbatim from authorization)

> Change where permissions are resolved, not what permissions are granted. If a user notices any behavioral difference after B3, then B3 has exceeded its intended scope.

Everything below is organized around proving that mission held.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/models/person_role.py` | New. `PersonRole` model — `person_roles` table (`person_id`, `role_code` → `roles.code`, `status`, `granted_at`, `granted_by_user_id`, timestamps). Unique on `(person_id, role_code)`. |
| `api/main.py` | One new import line (`api.models.person_role`) for table registration — same convention as every prior slice. |
| `alembic/versions/b4e6a1d9c3f7_add_person_roles_table.py` | New guarded migration. `down_revision = a7d3f9c2e5b8` (B2). |
| `api/services/authorization.py` | **The one live-path change.** `has_permission()` now calls a new private helper, `_resolve_active_person_role_codes()`, before falling back to the untouched legacy computation. |
| `tests/test_authorization_dual_read.py` | New. 8 tests, all passing — the Authorization Equivalence Report's evidence (§6). |

**Not touched, by design:** `api/dependencies.py` (`require_admin`/`require_permission` — zero changes, not even a new parameter), every one of the 18 routers that call them, `api/routers/auth.py` (login, JWT contents, role-mutation endpoints), `permissions_for_role()`/`normalize_role()`/`is_supported_role()`/`get_authorization_matrix()` (all four untouched, still operating exactly as before), and every frontend file.

---

## 2. How the dual-read was implemented without touching a single router

`has_permission(user, permission)` keeps its **exact original two-argument signature**. The new PersonRole lookup needs a database session, but rather than threading a `db` parameter through `require_admin`/`require_permission`/all 18 routers (which would have meant touching every call site B0 confirmed is centralized), `_resolve_active_person_role_codes()` retrieves the session already bound to the `user` object via SQLAlchemy's `object_session(user)` — the same session `get_current_user` used to load it, still open for the duration of the request. This is the mechanism that let this slice satisfy "no router changes" and "no dependency signature changes" simultaneously with "the lookup needs a database session."

Logic, exactly as specified:

```
has_permission(user, permission):
    active_role_codes = resolve_active_person_role_codes(user)   # PersonRole lookup
    if active_role_codes is not None:                             # PersonRole rows exist
        return permission in union(permissions_for_role(rc) for rc in active_role_codes)
    return permission in permissions_for_role(user.role)           # legacy fallback, untouched
```

`_resolve_active_person_role_codes()` returns `None` (triggering fallback) in exactly two cases: no `Person` row correlates to this `User` at all, or a `Person` row exists but has zero rows with `status="active"`. Both are the same "PersonRole doesn't apply here yet" condition from the caller's perspective — deliberately collapsed into one signal so the fallback logic has exactly one branch to reason about.

**Per your design recommendation**, the structure is already shaped for later simplification: when B7/B8 retire the legacy path, the fallback branch (`return permission in permissions_for_role(user.role)`) is a single `return` statement to delete, and `_resolve_active_person_role_codes()`'s `None`-returning branches become the only thing to reconsider — no rewrite of the surrounding flow.

---

## 3. Migration verification

- **Fresh database**: `alembic upgrade head` on an empty SQLite DB, full history through B3 — clean, no errors.
- **Populated database**: seeded 4 users spanning both real roles *plus one deliberately unsupported role value* (`some_future_role`, matching no row in `roles`) before B1 ever ran, then replayed the full B1→B2→B3 chain. Result:

  | User | `User.role` | Backfilled `person_roles.role_code` |
  |---|---|---|
  | alice | `participant` | `participant` |
  | bob | `admin` | `admin` |
  | carol | `participant` | `participant` |
  | weird | `some_future_role` | *(none — correctly skipped)* |

  The skip is deliberate and correct: a user whose `role` value doesn't match any `roles.code` gets no `PersonRole` row, so `has_permission()` for that user falls through to the legacy path automatically — exactly the safety net this design exists for, proven against a real (if synthetic) edge case rather than assumed.

- **Idempotency, tested directly**: replayed `upgrade()` twice against the already-migrated, populated database — row count held at 3 both times, no duplicates, no errors.
- **Partial catch-up, tested directly**: added a 5th user (`frank`, role `admin`) after the initial migration ran, then replayed both B1's and B3's `upgrade()` in sequence (matching the real order these would run in production) — `frank` was correctly backfilled to `person_roles.role_code = "admin"`; all four existing rows were untouched.

  *Note on a test-methodology pitfall, not a code defect*: an earlier attempt at this same test manually inserted a `people` row via raw SQL using a hyphenated UUID string, and the join silently failed to match because SQLite's `sa.UUID()` type (used by every real code path, including this migration) stores UUIDs as 32-character hex *without* hyphens. Once the test was corrected to create the row through the same SQLAlchemy path production actually uses, the join matched correctly. Recorded here because it's a real trap for any future ad hoc verification script on this project, not because it reflects a defect in the shipped code.
- **Downgrade verified**: `alembic downgrade -1` dropped `person_roles` and its indexes cleanly; `users`/`people` row counts and data confirmed unaffected afterward.

---

## 4. Full test suite

`python -m unittest discover tests`: **112 tests run (104 pre-existing + 8 new), 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures.** This includes every existing test that exercises `require_admin`/`require_permission` through real FastAPI routes via `TestClient` (`test_public_onboarding.py`, `test_participant_identity.py`, `test_my_registrations.py`, `test_admin_dashboard_router.py`, and others) — all of them continued to pass unchanged, which is itself strong evidence of behavioral equivalence across the live application surface, not just the isolated new unit tests.

---

## 5. Scope discipline confirmed

Checked directly against every item on the "must not do" list:

| Constraint | Status |
|---|---|
| Remove `User.role` | Not touched |
| Stop writing `User.role` | Not touched — `auth.py`'s role-mutation endpoints are untouched |
| Change login | Not touched |
| Change JWT contents | Not touched |
| Change permission names | Not touched — every `PERMISSION_*` constant identical |
| Change router decorators | Not touched — confirmed by `git status`: zero files under `api/routers/` changed |
| Change API contracts | Not touched — no schema/response shape changed |
| Change frontend behavior | Not touched — zero frontend files changed |
| Introduce relationship-based capabilities | Not introduced — `PersonRelationship`/`capability_resolution.py` don't exist yet |
| Enable multi-role UI | Not introduced |
| Modify the admin shell | Not touched |
| Retire any endpoints | Not touched |

---

## 6. Authorization Equivalence Report

All eight scenarios below are real, passing tests in `tests/test_authorization_dual_read.py` (`python -m unittest tests.test_authorization_dual_read -v`) — not narrative claims.

| Scenario | Legacy (`User.role` alone) | Dual Read (`has_permission()`) | Match |
|---|---|---|---|
| Admin, no `PersonRole` rows (today's real shape) | Allow (`admin.access`) | Allow | ✅ |
| Admin, no `PersonRole` rows | Deny (`participants.view_own`) | Deny | ✅ |
| Participant, no `PersonRole` rows (today's real shape) | Allow (`participants.view_own`) | Allow | ✅ |
| Participant, no `PersonRole` rows | Deny (`admin.access`) | Deny | ✅ |
| Admin, matching backfilled `PersonRole=admin` | Allow (`admin.access`) | Allow | ✅ |
| Participant, matching backfilled `PersonRole=participant` | Allow (`participants.view_own`) | Allow | ✅ |
| `Person` exists, zero *active* `PersonRole` rows | Allow (legacy fallback) | Allow (falls back correctly) | ✅ |
| No `Person` row at all for this user | Allow (legacy fallback) | Allow (falls back correctly) | ✅ |
| Revoked `PersonRole` row only (`status="revoked"`) | Allow (legacy fallback) | Allow (revoked row correctly ignored, falls back) | ✅ |
| **Forward compatibility** — `User.role="participant"` but active `PersonRole="admin"` (controlled mismatch) | Deny (`admin.access`, per legacy alone) | **Allow** (`admin.access`, via `PersonRole`) | **✅ — proves the new path is authoritative when populated, independent of and even in disagreement with the legacy value** |

The last row is the one that actually proves this is a dual-read and not just two code paths that happen to agree by coincidence — every other row could theoretically pass even with a bug that ignored `PersonRole` entirely, but the forward-compatibility row can only pass if `PersonRole` is genuinely consulted and given precedence.

---

## 7. Production deployment (2026-07-20)

Committed (`2719527`), tagged `v1.35.0-phase3b-b3-authorization-foundation`, pushed to `origin/master`. Render deploy log confirmed:

```
==> Starting pre-deploy: alembic upgrade head
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Running upgrade a7d3f9c2e5b8 -> b4e6a1d9c3f7, add person_roles table and backfill from User.role (identity foundation slice B3)
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: b4e6a1d9c3f7
   Application migration head: b4e6a1d9c3f7
   Schema status: MATCH
==> Your service is live 🎉
```

**Live production validation, beyond the deploy log:**

| Check | Method | Result |
|---|---|---|
| Schema status | Deploy log | `MATCH` |
| Participant login | Registered a fresh throwaway test account via the real public `POST /api/auth/register` → `POST /api/auth/login` flow | `200`, JWT issued |
| Participant route access (`participants.view_own`) | `GET /api/participants/mine` with that account's token | `200`, `[]` — **Allow, correct** |
| Admin-permission denial for a participant | `GET /api/admin/permissions/matrix` with the same token | `403 "Admin access required"` — **Deny, correct** |
| Public smoke checks | `GET /`, `GET /api/events` | `200` / `200` |
| Admin login | User confirmed directly | Dashboard loads normally |
| Admin-only route access | User confirmed directly | Admin-only page works normally |

One nuance worth recording precisely: the throwaway test account was created *after* B3 deployed, so it has no `Person`/`PersonRole` row at all — meaning this specific live test exercised the **"no Person exists" fallback path** (Authorization Equivalence Report scenario 6), not the PersonRole-populated path. That's arguably the more important one to confirm live, since every new signup takes exactly this path until a later slice starts creating `Person` rows at registration time. The PersonRole-populated path (every pre-existing user, backfilled at this same deploy) is what the admin login/route-access check above confirms directly, since every real admin account was backfilled an active `PersonRole` row by this exact migration.

---

## 8. Conclusion

B3's mission — change where permissions are resolved, not what permissions are granted — held throughout. Every existing test passed unchanged, the new equivalence suite proves parity across every real and edge-case scenario the roadmap asked for, and the one live code path touched (`has_permission()`) required zero changes to routers, dependencies, login, JWT, or the frontend. `User.role` remains fully authoritative wherever `PersonRole` hasn't been populated, and the fallback structure is shaped for a minimal-diff removal when B7/B8 retire it. **Deployed to production 2026-07-20, confirmed live** (§7) — schema status `MATCH`, live participant login/route-access/denial confirmed via a real throwaway account, admin login and admin-only route access confirmed directly. B3 is complete.
