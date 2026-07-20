# Phase 3B — Slice B6: Shadow Validation Report

## Status
Phase: 3B, Slice B6
Mode: Implementation — Observer Only, First Production Request-Path Participation
Repository Changes: 2 files edited (`api/services/capability_resolution.py` additively, `api/routers/participant_self.py`), 1 new test file. **No router dependency changed. No decorator changed. No new endpoint. No new schema. No response shape change.**

## B6 Mission (restated, verbatim from authorization)

> Run the capability engine in parallel with production authorization and verify equivalence without influencing any authorization outcome... The capability engine becomes an observer. It must never become an actor in B6.

---

## 1. Implementation scope

Exactly one endpoint, as instructed: `GET /api/participants/mine` (`api/routers/participant_self.py`).

| File | Change |
|---|---|
| `api/services/capability_resolution.py` | Additive only. New `resolve_capabilities_with_context()`, exposing the same result as `resolve_capabilities()` plus the `CapabilityContext` (role codes used, whether legacy fallback fired) needed for diagnostic logging. `resolve_capabilities()` itself now delegates to it — re-ran all 9 of B5's equivalence tests afterward to confirm this refactor changed nothing observable. |
| `api/routers/participant_self.py` | New private function `_shadow_check_participants_view_own(db, current_user)`, called once at the top of `list_my_registrations()`'s body. Nothing else in this file changed — the route's `Depends(require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN))` clause is untouched. |

**Not touched at all**: `api/dependencies.py` (`require_admin`/`require_permission` unmodified), every other router, every schema, every model, every frontend file. Confirmed by `git status` — only the two files above changed.

---

## 2. Request flow

```
GET /api/participants/mine
  -> require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN) dependency runs
       -> has_permission(current_user, "participants.view_own")   [UNCHANGED, Slice B3]
       -> if False: 403, route body never runs, shadow-check never runs
       -> if True: proceeds
  -> list_my_registrations() body runs
       -> _shadow_check_participants_view_own(db, current_user)   [NEW, Slice B6]
            -> resolve_capabilities_with_context(db, user=current_user)   [Slice B5, unmodified logic]
            -> compare engine's answer against "True" (implied by having reached this point)
            -> match:    return silently, nothing logged
            -> mismatch: log one structured WARNING line, return
            -> any internal error: caught, logged separately, never raised
       -> list_own_registrations(...) [UNCHANGED] builds the real response
  -> response returned, identical regardless of what the shadow-check found
```

The one structural property this diagram is meant to make obvious: **the shadow-check function has no return-value path that can reach the HTTP response.** Its result is called and discarded in the route body; nothing downstream reads it.

**Known, accepted scope limitation**: because `require_permission(...)` raises before the route body ever executes, this shadow-check can only ever observe the case where legacy authorization already said *Allow*. A legacy *Deny* at this endpoint never reaches the shadow-check at all. This is inherent to shadowing at the body level rather than the dependency level, and matches your explicit constraint not to touch router dependencies — it also matches the endpoint's real traffic shape (a self-service, already-permission-gated endpoint), so the case this can't observe is not the case this endpoint sees in practice.

---

## 3. Comparison methodology

For each request that reaches the route body:

- **Legacy decision**: implicitly `True` — reaching this line already means `has_permission()` (via the untouched `require_permission` dependency) allowed it.
- **Capability engine decision**: `PERMISSION_PARTICIPANTS_VIEW_OWN in resolve_capabilities_with_context(db, user=current_user)[0]`, computed independently, using the identical Roles-layer logic already proven equivalent to `has_permission()` in the B3 and B5 equivalence reports — now exercised against real request-scoped data for the first time rather than synthetic test fixtures only.
- **On match**: nothing is logged, nothing is recorded, per your explicit "if identical, do nothing."
- **On mismatch**: one structured `logging.warning(...)` line, containing:
  - `check_id` — a fresh UUID per check, since this project has no request-ID middleware to reuse (noted as "if available" in your spec; none was available, so one is generated per check instead).
  - `endpoint` — literal `"GET /api/participants/mine"`.
  - `permission` — `"participants.view_own"`.
  - `user_id` — the credential's id.
  - `person_id` — the correlated `Person.id`, or `None` if no `Person` exists yet for this user.
  - `legacy_decision` / `engine_decision` — both booleans.
  - `used_legacy_fallback` / `role_codes` — the `CapabilityContext`'s evaluation-path detail, serving as the "reason" field.
  - **Never logged**: the JWT, the password hash, the email address, or any other request payload content — confirmed directly by a test asserting the email never appears in the log line (§4).
- **On any internal error** (e.g., the engine's own query failing): a separate `capability_engine_shadow_check_error` warning is logged with `exc_info=True`, and the function returns without raising — the shadow-check's own failure can never surface to the client or block the request, by construction (a blanket `try/except Exception` around the entire comparison).

---

## 4. Local validation

New test file: `tests/test_shadow_check_participants_mine.py`, 8 tests, all passing:

| Test | Proves |
|---|---|
| `test_matches_and_logs_nothing_legacy_only` | A real legacy-only user (no `Person`) produces a match, and `assertNoLogs` confirms literally nothing is logged. |
| `test_matches_and_logs_nothing_with_matching_person_role` | Same, for a user with a real, matching, backfilled `PersonRole`. |
| `test_mismatch_is_logged_with_structured_fields_and_never_raises` | A deliberately forced disagreement (engine mocked to return an empty grant set) produces exactly one structured log line containing every required field, and the function returns without raising. |
| `test_internal_error_is_caught_logged_and_never_raised` | A simulated internal exception is caught, logged as a distinct `capability_engine_shadow_check_error` event, and the function still returns normally. |
| `test_endpoint_response_identical_with_shadow_check_active` | The real endpoint, hit through `TestClient`, returns exactly the response it always has. |
| `test_shadow_check_invoked_on_every_request_without_altering_response` | A spy on the shadow-check function confirms it runs exactly once per request (proving "the capability engine executes for every eligible request" directly, rather than by inference), and two consecutive requests return identical bodies. |
| `test_endpoint_response_unaffected_even_when_shadow_check_would_mismatch` | Even when the shadow-check is forced into a mismatch, the endpoint's HTTP response is unchanged — the strongest direct proof that the observer cannot become an actor. |
| `test_unauthenticated_request_still_rejected_before_shadow_check_runs` | An unauthenticated request is still `401`'d by the untouched dependency chain before the shadow-check (or the route body at all) ever runs. |

A genuine mismatch is not naturally reproducible with today's real data — B3's and B5's own equivalence reports already established that the engine and legacy path compute the same thing by construction. The mismatch test above deliberately mocks the engine's return value to exercise the *logging mechanism itself*, which is the only thing this slice needed to prove could work correctly, since it's the piece with no other test coverage before B6.

**Full existing suite**: `python -m unittest discover tests` — **129 tests (121 pre-existing + 8 new), 4 errors, identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures, and — checked directly, not assumed — zero unexpected `capability_engine_shadow_mismatch` warnings anywhere in the existing suite's output**, including `tests/test_my_registrations.py`'s 13 pre-existing tests against this exact endpoint, none of which create `Person`/`PersonRole` fixtures and therefore all correctly resolve via the legacy-fallback path on both sides, in agreement.

---

## 5. Production validation (2026-07-20)

Committed (`81f7061`), tagged `v1.38.0-phase3b-b6-shadow-validation`, pushed to `origin/master`. Deploy log confirmed no migration ran (correct) and:

```
==> Starting pre-deploy: alembic upgrade head
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: c8f2b6a4d1e9
   Application migration head: c8f2b6a4d1e9
   Schema status: MATCH
==> Your service is live 🎉
```

**Live checks:**

| Check | Method | Result |
|---|---|---|
| Clean startup | Deploy log | No errors, service live |
| Schema status | Deploy log | `MATCH` (unchanged from B4/B5) |
| Participant login | Fresh throwaway test account via real public register/login flow | `200`, JWT issued |
| `GET /api/participants/mine` (the shadowed endpoint) | Hit twice, consecutively | `200`, `[]` both times — response unaffected |
| Admin-only endpoint, denied for a participant | `GET /api/admin/permissions/matrix` | `403` — unchanged |
| Public smoke checks | `GET /`, `GET /api/events` | `200` / `200` |
| Admin login + admin-only pages | **Confirmed by real production traffic in the Application Logs**, not just a synthetic check — genuine browser requests to `GET /api/admin/events/`, `/api/admin/dashboard/metrics`, `/api/admin/audit/events`, `/api/admin/communications/messages`, `/api/admin/communications/deliveries` all returned `200 OK` in the same log window | Working normally |

## 6. Mismatch count

**Zero** — confirmed directly against real production Application Logs (not inferred), covering the full deploy window plus the live checks above: **no occurrence of `capability_engine_shadow_mismatch` or `capability_engine_shadow_check_error` anywhere**, across both the genuine admin browsing session and the two direct hits on `GET /api/participants/mine`. Every request to the shadowed endpoint logged a plain `200 OK` with nothing else attached — exactly the "if identical, do nothing" behavior this slice was built to produce. This matches every local check (§4) and the equivalence reports B3 and B5 already established.

## 7. Performance observations

The shadow-check adds, per eligible request: one `Person` lookup by `user_id` (indexed since Slice B1) and one `PersonRole` lookup by `person_id` + `status` (indexed since Slice B3) — two simple, indexed, single-row-or-small-result queries, no joins across unrelated tables, no N+1 pattern (this endpoint already returns a small, per-user result set). No load testing was performed (out of scope for a single low-traffic, participant-facing, read-only endpoint), but structurally there is no reason to expect measurable latency impact — the added queries are the same shape and cost class as the ownership queries `list_own_registrations()` already performs on the very same request.

---

## 8. Scope discipline confirmed

| Constraint | Status |
|---|---|
| Replace `has_permission()` | Not touched — still the sole enforcement path |
| Change router dependencies | Not touched — `Depends(require_permission(...))` clause identical |
| Change decorators | Not touched |
| Return capability-engine results | Not returned anywhere — the shadow-check's return value is call-and-discard in the route body |
| Add feature flags | None added — the shadow-check always runs, unconditionally, for every request reaching the route body |
| Expand beyond the chosen endpoint | Confirmed by `git status` — only `participant_self.py` and `capability_resolution.py` changed |
| Introduce relationship-based permissions | Not introduced — the shadow-check only exercises the Roles layer, exactly as B5 left it |

---

## 9. Conclusion

B6's mission — run the capability engine in parallel with production authorization and verify equivalence without influencing any outcome — held exactly, proven directly rather than by inference at every level: a dedicated local test forces a mismatch and confirms the response is unaffected regardless, a spy confirms the engine runs on every eligible request, the full existing test suite (including 13 pre-existing tests against this exact endpoint) shows zero spurious warnings, and **production's own Application Logs confirm zero mismatches across real admin traffic and real participant requests** in the same window. `has_permission()` remains the sole source of truth, byte-for-byte unchanged since B3. **Deployed and validated live, 2026-07-20.** B6 is complete.
