# Phase 3C — Slice B11: Architecture Review

> **Status:** Review only. No implementation. Answers the questions posed for B11 — continuous `PersonRole` issuance — against the current codebase.
> **Baseline reviewed against:** `v1.42.0-phase3c-b10-own-participant-capability`.

## 0. Why B11 is different from B9/B10

B9 and B10 each swapped one dependency; the underlying resolution logic (`has_permission()`/`has_capability()`) never changed. B11 changes what happens on write — every account creation, and every admin role change — for the first time since B3. That's a strictly larger blast radius in kind, even though (per §7 below) the actual code surface turns out to be small.

---

## 1. Issuance point: where should `PersonRole` be created?

Traced every place a `User` row is created in the application (`grep -r "User(" api/`): **exactly one** — `api/routers/auth.py::register()` (`POST /auth/register`). There is no admin-created-user endpoint, no invitation flow, and no password-reset/recovery flow anywhere in this codebase (confirmed by search — none exist). This simplifies the "issuance point" question considerably: **there is only one place a new account is ever created**, and it's the same place B7 already added `Person` creation to.

`register()` always creates the new `User` with `role=ROLE_PARTICIPANT` (hardcoded, `api/routers/auth.py:52`) — never any other role. So the initial `PersonRole` grant at registration time has a trivially correct answer: grant `role_code="participant"`, always, no branching needed.

**Recommendation**: issue the initial `PersonRole` in `register()`, immediately alongside the existing `Person` creation (§4 covers the transaction shape). No other issuance point exists to consider today; if an admin-created-user or invitation flow is ever added later, it inherits this same pattern by construction.

---

## 2. Role synchronization: should `PersonRole` become authoritative, and how does it stay in sync with `User.role`?

The three role-mutation endpoints (`update_user_role`, `update_user_role_by_email`, `update_user_role_by_email_body`, all in `api/routers/auth.py`) are the only place `User.role` is ever changed after account creation. Per B10's review and the `KNOWN_TECHNICAL_DEBT.md` entry it produced, all three currently write **only** `user.role = new_role` — never touching `PersonRole` — which is exactly the divergence risk the review question refers to.

**Recommendation**: these three endpoints should, in the same transaction as the existing `user.role = new_role` write, also:
1. Revoke whichever `PersonRole` is currently active for that person (if any), and
2. Grant (or reactivate) a `PersonRole` for `new_role`.

This makes `PersonRole` the thing `has_permission()`/`has_capability()` actually resolve against immediately after any role change (matching the dual-read's own preference for `PersonRole` when present), while `User.role` keeps being written too — not because anything still needs to read it going forward, but because it's cheap to keep truthful and several places (`GET /admin/users` filtering, `GET /auth/me`'s `role` field, the JWT's decorative `role` claim) still surface it directly. **`User.role` is not being made "not authoritative" by this slice — it's being kept synchronized rather than allowed to drift**, which is a narrower, safer claim than declaring one field authoritative over the other.

A small, reusable pair of functions is needed to avoid duplicating this grant/revoke logic three times — see §7.

---

## 3. Idempotency: preventing duplicates, handling retries safely

`person_roles` already has `UniqueConstraint("person_id", "role_code")` (`api/models/person_role.py:41-43`) — the database itself refuses a true duplicate `(person, role_code)` pair. That constraint shapes the correct grant semantics: **granting a role is "get the existing `(person_id, role_code)` row and ensure `status="active"`", not "always insert."** A naive `PersonRole(...); db.add(...)` on every call would raise an integrity error the second time the same grant is attempted (e.g., an admin re-clicking "make admin" on an already-admin account, or a safe retry after a network blip).

At the registration endpoint specifically, this is close to moot: `register()` already rejects a duplicate email before either `Person` or `PersonRole` would be created (`api/routers/auth.py:45-47`), so the same registration can't run twice for the same account. The get-or-reactivate pattern still matters for the role-mutation endpoints, where "grant the same role again" is a realistic, harmless action an admin might repeat.

---

## 4. Failure behavior: what happens if `PersonRole` creation fails after `Person` creation?

Current `register()` code creates `User` (committed, refreshed) then `Person` (added, committed) as two separate commits — then wraps verification-token creation in its own try/except, explicitly because email delivery is an external dependency that can legitimately fail independent of the database (`EmailDeliveryError`, already handled).

`PersonRole` creation has no external dependency at all — it's a pure, local database write, exactly like `Person`. There's no principled reason to give it a third separate commit and a third failure mode to reason about.

**Recommendation**: add the initial `PersonRole` grant to the **same commit as `Person`**, not a separate one. This doesn't eliminate the possibility of failure (a database outage can still fail any commit), but it eliminates the specific scenario the question asks about — "`Person` succeeded, `PersonRole` failed" stops being a reachable state, because they either both land or neither does. If that combined commit fails, `User` is already committed (matching the existing "account creation must not fail because a later step failed" philosophy already established for the email step) — the account exists, has no `Person`/`PersonRole` yet, and resolves entirely through the legacy fallback until the next reconciliation pass (§5) picks it up. This is the same recoverable-gap pattern this project has already used twice (B1's backfill, B7's gap-window migration) — not a new risk, a familiar one with an established remedy.

**Fail-closed vs. compensating logic**: neither is needed here, precisely because there's nothing to compensate — a `User` without a `Person`/`PersonRole` is not a broken or unsafe state, it's the exact state every account was in before B7 shipped, and the legacy fallback handles it correctly and safely by design.

---

## 5. Existing accounts: one-time reconciliation, not prospective-only

Per B10's review, `PersonRole` backfill has run exactly once (B3's deploy). Every account created since then has zero `PersonRole` rows. Making issuance continuous going forward (§1) does not, by itself, close that existing gap — it only stops it from growing further.

**Recommendation: yes, a one-time reconciliation migration, in the same spirit as B7's gap-window migration.** For every `Person`, ensure their active `PersonRole` set matches their current `User.role` exactly:
- If a `Person` has no active `PersonRole` at all → grant one matching their current `User.role` (closes the "never backfilled" gap).
- If a `Person` has an active `PersonRole` that **disagrees** with their current `User.role` → this is precisely the divergence bug flagged in `KNOWN_TECHNICAL_DEBT.md` (an admin changed the role via the UI after B3, but only the legacy field moved). Treat `User.role` as ground truth for this one-time reconciliation — it's the field the admin actually intended to change through the only UI that exists for this — and revoke the stale grant, issuing the correct one instead.

This is additive-only (inserts/status-updates into an already-existing table, no DDL) and uses the exact same idempotent, guarded migration pattern already established in B1/B3/B7 — safe to replay, safe against partial completion. It directly resolves both `KNOWN_TECHNICAL_DEBT.md` entries B10 logged, not just the "never issued" one.

---

## 6. Backward compatibility & rollback

Nothing about `has_permission()`/`has_capability()` needs to change — both were already built (B3/B5) to prefer an active `PersonRole` when one exists, falling back to legacy only when none does. Once issuance is continuous, new accounts simply stop needing the fallback branch; existing behavior for every account is unchanged, since the resolution logic itself is untouched. This is the same backward-compatibility argument B9/B10 relied on, extended to the write side instead of the read side.

**Rollback**: reverting `register()`'s change and the three role-mutation endpoints' change is a single commit, no data implications — any `PersonRole` rows already granted are harmless to leave in place (indistinguishable from B3's original backfill rows). The reconciliation migration's rollback is the same honest non-reversal B7's gap-window migration already used: nothing to meaningfully undo, since the rows it creates/updates are indistinguishable from ones created by continuous issuance itself.

---

## 7. Expected files

| File | Change |
|---|---|
| `api/routers/auth.py` | `register()`: initial `PersonRole` grant added to the same commit as `Person` creation. Three role-mutation endpoints: each gains a revoke-old/grant-new `PersonRole` call alongside the existing `user.role = new_role` write. |
| New service module (recommend `api/services/person_role_management.py`) | Small, reusable `grant_person_role(db, person, role_code, granted_by_user_id=None)` / `revoke_person_role(db, person, role_code)` pair, implementing the get-or-reactivate idempotency from §3. Kept separate from `api/services/capability_resolution.py` deliberately — that module's own stated mission (§ its docstring) is centralized *resolution*, not mutation; mixing writes into it would blur a boundary B5 was explicit about. Also separate from `api/services/authorization.py`, which is a pure permission-mapping module today with no DB writes at all. |
| New guarded Alembic migration | One-time reconciliation per §5. Data-only (no DDL), same idempotent pattern as `d5a9e2c7f3b1_backfill_person_gap_window.py`. |
| New/extended tests | Registration grants exactly one `PersonRole` matching the initial role; the grant/revoke helper is idempotent (repeated calls produce no duplicate rows, no integrity errors); each role-mutation endpoint revokes the old grant and issues the new one; the reconciliation migration's fresh/populated/idempotent/partial-catch-up/downgrade suite (same rigor as B1/B3/B7) plus its PostgreSQL-dialect DDL compile check (not applicable here since there's no DDL, but the checklist item should still be explicitly marked N/A, not silently skipped); an authorization equivalence re-check (mirroring B3/B5's own equivalence reports) confirming no account's resolved permissions change as a result of this slice. |

**Not touched**: `api/services/capability_resolution.py`, `api/dependencies.py`, both routers migrated in B9/B10, every other endpoint's authorization.

---

## 8. Production validation plan

- Register a fresh throwaway account; confirm (as before) it gets a `Person`; additionally confirm it now has an active `person_roles` row for `participant` — this specific fact isn't observable via any existing API response (no endpoint exposes raw `PersonRole` rows or `CapabilityContext.used_legacy_fallback`), so, consistent with B7's precedent, this needs one direct read-only query via Render Shell against the new account's `person_id`, run by the user.
- Confirm `GET /auth/me`'s `capabilities` field (B8) still resolves correctly for that new account (it will, automatically, since it already calls the same engine) — this is an indirect but real signal that resolution succeeded either way, though it can't distinguish *which* branch (PersonRole vs. fallback) produced the answer on its own.
- Exercise one of the three role-mutation endpoints against a throwaway account; confirm (via the same kind of direct query) that the old `PersonRole` is now revoked and the new one is active, and that `GET /auth/me`'s `capabilities` for that account reflects the new role immediately.
- Full regression: admin dashboard/executive dashboard/communications unaffected; B9/B10's endpoints unaffected; existing accounts' behavior unaffected.

## 9. Success criteria (validated against the plan above)

| Criterion (as stated) | How this plan satisfies it |
|---|---|
| Every newly created account automatically receives the correct `PersonRole` | §1 — registration grants it in the same commit as `Person` |
| New accounts no longer depend on the legacy fallback | §1/§6 — the dual-read already prefers `PersonRole` when present; new accounts have one from the moment they exist |
| Existing accounts continue to function unchanged | §5/§6 — reconciliation only adds/corrects `PersonRole` rows to match each account's own current `User.role`; resolution logic itself is untouched |
| No schema changes unless strictly necessary | None needed — `person_roles` already has every column this slice uses |
| Rollback remains straightforward | §6 — single commit, no data implications |

---

## 10. Summary of what needs the user's decision

1. Accept issuing the initial `PersonRole` at registration only (§1) — confirmed as the only real issuance point in this codebase today.
2. Accept extending scope to the three role-mutation endpoints (§2) — necessary to actually close the divergence risk the review question named, not optional cleanup.
3. Accept the one-time reconciliation migration (§5), including treating `User.role` as ground truth for any existing divergence it finds — versus a narrower "only backfill accounts with zero PersonRole rows" approach that would leave the known divergence bug unfixed.
4. Accept the new `person_role_management.py` service module placement (§7), or prefer a different location (e.g., inside `authorization.py`).
5. Confirm the production validation plan's reliance on a direct Render Shell query (§8) for the one fact ("did this resolve via PersonRole, not fallback") no existing API can show.

No code has been written. Awaiting your decision before any implementation.
