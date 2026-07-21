# Phase 3C — Slice B9: Verification Report

## Status
Phase: 3C — Identity Capability Transition, Slice B9
Mode: Implementation — First Authoritative Capability-Based Authorization Decision
Repository changes: 2 existing files edited, 1 existing test file amended, 1 new test file. Matches the approved diff boundary from `PHASE3C_SLICE_B9_ARCHITECTURE_REVIEW.md` (as amended by its §4 correction) exactly.

## B9 Mission (as approved)

> Replace the legacy `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` authorization decision on `GET /api/participants/mine` with a new capability-based dependency, `require_capability(...)`, backed by the Slice B5 engine. Preserve every existing outcome (participant succeeds, admin is denied). No schema change. Single-commit rollback. Fail closed on any internal error. No dual-decision period — direct replacement, conditioned on B6's production shadow-check having logged zero real mismatches (confirmed by the user: none found across all Application Logs).

---

## 1. What shipped

| File | Change |
|---|---|
| `api/dependencies.py` | New `require_capability(permission)` dependency factory, alongside the existing `require_permission()`/`require_admin()`. Imports `has_capability` from `api.services.capability_resolution`. |
| `api/routers/participant_self.py` | `list_my_registrations()`'s dependency changes from `require_permission(...)` to `require_capability(...)`. The B6 shadow-check call site is removed from the route body. `_shadow_check_participants_view_own()` itself is retained, unmodified, uncalled — its docstring now records why. `get_own_participant()` (the other route in this file) is untouched, still on `require_permission()`. |
| `tests/test_shadow_check_participants_mine.py` | Amended, not rewritten: the 4 direct unit tests of `_shadow_check_participants_view_own()` are unchanged (still valid — they exercise the function directly, independent of the router). The 3 endpoint-integration tests whose premise depended on the router still invoking the shadow-check are replaced with 2 tests: one proving the function is no longer invoked by the route (direct opposite of B6's former assertion), one confirming anonymous rejection is unchanged. |
| `tests/test_participants_mine_capability_enforcement.py` | New, 8 tests. |

**Diff boundary matches the approved, amended plan exactly** (`git status --porcelain` — see §6): `api/services/capability_resolution.py` untouched, no router other than `participant_self.py` and no dependency other than the new one in `dependencies.py` touched, `get_own_participant()` untouched.

---

## 2. Corrected validation semantics — confirmed in the implementation

Per the user's approved correction (architecture review §3): `participants.view_own` is granted only to the `participant` role. `test_admin_receives_403_unchanged_from_legacy_behavior` proves an admin account with no `PersonRole` override still receives `403` — identical to pre-B9 behavior — rather than treating admin access as a new positive case.

## 3. The engine is genuinely the decision-maker, not a passthrough

`test_active_person_role_denial_overrides_stale_legacy_participant_role` constructs the forward-compatibility case already established since B3/B5/B8: legacy `User.role` says `participant`, but the only active `PersonRole` grant is `admin`. The endpoint returns `403` — proving `require_capability()` is consulting the real, `PersonRole`-first resolution, not reading the legacy field directly or granting on some other shortcut. This is the single most important correctness test in this slice, mirroring the standard this project has held every dual-read transition to since B3.

## 4. Fail-closed behavior — proven directly

`test_capability_resolution_error_fails_closed_not_500` mocks `api.dependencies.has_capability` to raise unconditionally and confirms:
- The endpoint returns `403`, not `500`.
- A `capability_engine_authorization_error` warning is logged with `exc_info=True`.
- There is no fallback to legacy `has_permission()` anywhere in the path — the exception handler in `require_capability()` denies directly.

`test_capability_denial_is_logged` confirms a genuine denial (admin, no capability) logs `capability_engine_authorization_denied` at `INFO`, distinguishing "denied" from "errored" in the log stream — both are denials to the caller, but only one indicates an engine malfunction worth alerting on.

## 5. Backward compatibility — confirmed

- Response schema, status codes for authorized users, URL, and frontend code are all unchanged — `list_own_registrations()` and the response-building code in `participant_self.py` were not touched.
- `tests/test_my_registrations.py` (19 tests covering ownership scoping, ordering, waiver-status derivation, waitlist display, admin-field exclusion, route-shadowing) required **no changes** and passes unmodified — none of those tests depend on which dependency decided authorization, only on what happens once it's granted.
- `GET /participants/{participant_id}` is untouched (`test_get_own_participant_route_still_uses_legacy_permission_dependency` confirms it still returns `404` rather than `403` for an authenticated participant on a random id, proving `require_permission()` still grants entry to that route exactly as before).

## 6. Full test suite

`PYTHONIOENCODING=utf-8 python -m unittest discover tests`: **154 tests (148 pre-existing + 6 net new — 8 added in the new B9 file, 2 removed from the amended B6 file), 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures.**

(Note: this environment's default console codepage (`cp1252`) cannot render this project's `✅` status characters at import time, which previously surfaced as 13 unrelated import errors — resolved by setting `PYTHONIOENCODING=utf-8` for the run, not a code change. Unrelated to this slice.)

## 7. No schema or database change

Confirmed — no migration file added or needed. `require_capability()` is a pure authorization function; nothing about this slice touches persisted data.

## 8. Rollback

Revert the single commit touching `api/dependencies.py` and `api/routers/participant_self.py` (plus its test files). `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` is restored on the route, `require_capability()` disappears, and the (never-modified) shadow-check function is simply uncalled again — indistinguishable from B8's end state. No data implications at all, matching the architecture review's §9 assessment.

---

## 9. Production deployment (2026-07-21)

Committed (`405b8c3`), tagged `v1.41.0-phase3c-b9-capability-enforcement`, pushed to `origin/master`. Deploy log confirmed no migration ran (correct — no schema change in this slice) and:

```
==> Starting pre-deploy: alembic upgrade head
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: d5a9e2c7f3b1
   Application migration head: d5a9e2c7f3b1
   Schema status: MATCH
==> Your service is live 🎉
```

**Live validation:**

| Check | Method | Result |
|---|---|---|
| Clean startup | Deploy log | No errors, service live |
| Schema status | Deploy log | `MATCH` (unchanged — no migration this slice) |
| Positive case | Fresh throwaway participant account → `GET /api/participants/mine` | `200`, `[]` — capability engine grants access via the real production fallback path |
| Anonymous | `GET /api/participants/mine`, no token | `401`, `{"detail":"Not authenticated"}` — unchanged |
| Fail-closed path in production | Application Logs search: `capability_engine_authorization_error` | Zero matches |
| Denial path in production | Application Logs search: `capability_engine_authorization_denied` | Zero matches — expected steady state, since nothing besides the participant portal calls this endpoint under normal use |
| Admin regression | Confirmed directly | Dashboard, Executive Dashboard, and Communications all load normally |

Every check matches expected behavior exactly. Pending: an observation window checking Application Logs for continued zero `capability_engine_authorization_error` occurrences under real traffic, per the acceptance criteria — same discipline as B6, B7, and B8.

## 10. Conclusion

B9 replaces legacy authorization with the Capability Resolution Engine's decision for the first time in production, on the one endpoint (`GET /api/participants/mine`) whose equivalence was already proven live by B6's shadow-check and confirmed clean by the user's own Application Logs search. Every outcome — who succeeds, who is denied, and why — is unchanged from before this slice; only the mechanism deciding those outcomes has moved to the canonical engine. `api/services/capability_resolution.py` required zero modification, again confirming B5's abstractions are sound four slices later.

**Deployed to production 2026-07-21 and validated live** (§9).

**Status: CLOSED (2026-07-21).** The observation window completed cleanly, with zero unexpected `capability_engine_authorization_error` entries, matching the precedent set by B6, B7, and B8. `v1.41.0-phase3c-b9-capability-enforcement` is adopted as the new canonical production baseline for Phase 3C — Identity Capability Transition.
