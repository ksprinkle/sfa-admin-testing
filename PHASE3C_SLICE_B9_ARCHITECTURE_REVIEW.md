# Phase 3C — Slice B9: Architecture Review

> **Status:** Review only. No implementation authorized by this document.
> **Slice:** B9 — First Authoritative Capability-Based Authorization Decision
> **Depends on:** B5 (Capability Resolution Engine), B6 (shadow validation, same endpoint), B8 (capability exposure) — all closed.

This document is the required architecture review for B9, per the roadmap's own gate (`PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md` §"B9 — first authoritative capability decision") and the user's explicit instruction that B9 receive at least B3/B7-level scrutiny before any code. It incorporates the design the user proposed directly, checks it against the current implementation, and flags two corrections plus one naming collision found during that check. **Implementation is not authorized until the user has reviewed the corrections below and explicitly approves.**

---

## 1. Mission

Change the authorization decision for exactly one endpoint — `GET /api/participants/mine` — from legacy `has_permission()` to the Capability Resolution Engine's `has_capability()`. This is the first slice where the engine becomes the thing that actually decides, not merely a shadow observer (B6) or an exposed value (B8). Nothing else changes.

## 2. Current state, confirmed against code

| Component | File | Current role |
|---|---|---|
| Enforcement | [`api/dependencies.py:68-73`](api/dependencies.py) | `require_permission(permission)` — a dependency factory wrapping `has_permission()`. Raises `403` on denial. Requires only `get_current_user` (which itself raises `401` for a missing/invalid token). |
| Legacy decision | [`api/services/authorization.py:111-121`](api/services/authorization.py) | `has_permission()` — `PersonRole`-first, `User.role`-fallback. Sole authority for every router today, including this one. |
| Capability decision | [`api/services/capability_resolution.py:154-172`](api/services/capability_resolution.py) | `resolve_capabilities()` / `has_capability(db, user=..., permission=...)` — proven equivalent to `has_permission()` for role-based grants (`test_capability_resolution_equivalence.py`, 9 tests); relationship-based capabilities are scaffolded but return an empty set unconditionally, so they cannot contribute to this decision today. |
| Target endpoint | [`api/routers/participant_self.py:89-93`](api/routers/participant_self.py) | `list_my_registrations()`, gated by `Depends(require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN))`. Already carries B6's shadow-check (`_shadow_check_participants_view_own`), which independently calls the capability engine on every request today and logs on mismatch only. |
| Permission mapping | [`api/services/authorization.py:34-52`](api/services/authorization.py) | `PERMISSION_PARTICIPANTS_VIEW_OWN` is granted only to `ROLE_PARTICIPANT`. `ROLE_ADMIN` does **not** carry it. |

Confirmed: B5's engine has required zero modification through B6, B7, and B8. B9's own review inherits that same expectation — see §9.

## 3. Correction 1 — the "admin succeeds" positive case is wrong for this endpoint

The proposed validation plan lists "Admin account succeeds" as a positive case. Checked against `ROLE_PERMISSIONS` (`authorization.py:34-52`): `participants.view_own` is granted only to the `participant` role. An admin account with no `PersonRole` override gets **403 today**, under legacy `has_permission()`, before B9 changes anything. `test_capability_resolution_equivalence.py::test_admin_legacy_only` proves the capability engine agrees.

This looks like carryover from the general "confirm admin login/dashboard still works" regression check used in every prior slice's validation pattern — appropriate as an *overall regression check*, but not as this endpoint's positive case. Corrected validation plan (§8 below): admin's expected result on `GET /participants/mine` is **403, identical before and after**, not a success case. The general "admin dashboard/session unaffected" check still belongs in validation, just not framed as this endpoint succeeding.

## 4. Correction 2 — expected files must include `api/dependencies.py`

The proposed expected-files list is `api/routers/participant_self.py` plus tests, with `capability_resolution.py` untouched. Checked against the actual enforcement mechanism: `require_permission()` lives in `api/dependencies.py`, not in the router, and its dependency signature (`current_user: User = Depends(get_current_user)`) has no `db: Session` parameter, because `has_permission()` recovers its own session via `object_session(user)` (`authorization.py:89`). `has_capability()`, however, takes `db` as an explicit parameter (`capability_resolution.py:166-167`) — B5 built it that way deliberately, and changing that signature is out of scope here.

This means B9 needs a new dependency, `require_capability(permission)`, mirroring `require_permission()`'s shape but requesting `db` via `Depends(get_db)` in addition to `current_user`. That function belongs in `api/dependencies.py`, alongside `require_permission()` and `require_admin()` — the same file, same pattern, same place a future reader would look for it. **Amended expected-files list**:

| File | Change |
|---|---|
| `api/dependencies.py` | New `require_capability(permission)` dependency factory. `require_permission()` and `require_admin()` untouched. |
| `api/routers/participant_self.py` | `list_my_registrations()`'s dependency changes from `require_permission(...)` to `require_capability(...)`. The B6 shadow-check call is removed from this endpoint (see §5) — it has done its job. `get_own_participant()` (the other route in this file) is untouched. |
| New/extended tests | Positive, negative, and error-path coverage for `require_capability()`, plus an endpoint-level test file for the migrated route. |

`api/services/capability_resolution.py` itself still requires **no modification** — B9 consumes `has_capability()` exactly as B5 built it, which is the property this whole transition has been building toward proving.

## 5. What happens to the B6 shadow-check

B6's `_shadow_check_participants_view_own()` exists specifically to answer the question B9 is now acting on: "does the capability engine agree with legacy, on this endpoint, under real production traffic?" Once `require_capability()` becomes the sole decision-maker, the shadow-check has nothing left to observe — legacy `has_permission()` is no longer consulted at all for this route, so there is no second opinion to compare against.

**Recommendation: remove the shadow-check call from `list_my_registrations()` in this same slice**, rather than leaving dead code that silently calls `resolve_capabilities_with_context()` a second time per request for no purpose. This should be called out explicitly in the diff so it doesn't read as an accidental deletion — it's B6 completing its job, not a regression. The function definition and its own test file (`test_shadow_check_participants_mine.py`) can stay in the repo as historical proof of the equivalence work (mirroring the "historical documents are read-only" spirit, applied to test evidence) or be removed — this is a small enough judgment call that I'd default to **removing the now-dead call site but leaving the test file in place**, since the test file documents proven behavior, not living code. Flagging for the user's preference rather than deciding unilaterally.

## 6. Enforcement design

```python
# api/dependencies.py
def require_capability(permission: str):
    def _capability_dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        try:
            granted = has_capability(db, user=current_user, permission=permission)
        except Exception:
            logger.warning(
                "capability_engine_authorization_error user_id=%s permission=%s",
                current_user.id, permission, exc_info=True,
            )
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        if not granted:
            logger.info(
                "capability_engine_authorization_denied user_id=%s permission=%s",
                current_user.id, permission,
            )
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        return current_user

    return _capability_dependency
```

This directly satisfies the user's stated failure semantics: **fail closed** (an exception denies, it never falls back to legacy and never grants), **same status code and detail string as `require_permission()` today** (`403`, `"Insufficient permissions"` — client-visible behavior is unchanged for both the success and denial paths), and **the reason is logged, not swallowed**.

No `legacy OR capability` and no `legacy THEN capability` — `require_permission(...)` is replaced outright by `require_capability(...)` on this one route. Every other endpoint in the codebase keeps calling `require_permission()` unchanged.

## 7. Capability mapping and authorization-semantics equivalence

Single capability, no compounding: `participants.view_own`. No relationship inheritance, no household expansion, no admin delegation — consistent with the constraint that `_resolve_relationship_capabilities()` still contributes nothing today (confirmed §2). The only two people who can be affected by this change are:

- A `participant`-role user with no `PersonRole` override: legacy grants via `permissions_for_role("participant")`; engine grants via the identical fallback path in `_resolve_role_based_permissions()`. **Same result.**
- A user with an active `PersonRole` (forward-compatibility case, exercised since B3): both legacy and engine already resolve `PersonRole`-first, identically (`test_forward_compatibility_matches_between_engines`). **Same result.**

There is no code path today that produces a divergence between the two for this permission — that is the entire point of B5's equivalence report and B6's live shadow validation. B9 does not introduce new authorization semantics; it changes *which function is asked the question*, not what the answer is.

## 8. Production validation plan (corrected)

| Case | Expected result | Why |
|---|---|---|
| Participant account, own registrations | `200`, same payload shape as today | Positive case — engine grants `participants.view_own` via role, same as legacy |
| Anonymous request (no token) | `401` | Unchanged — `get_current_user` rejects before `require_capability` ever runs |
| Admin account, no `PersonRole` override | `403` | **Corrected from "succeeds" — matches today's behavior exactly; this is a regression check, not a new success case** |
| Participant account with a revoked `PersonRole` and no legacy role fallback path applicable | `403`, deterministic | Confirms denial is real, not silently bypassed |
| Response payload for the authorized case | Byte-for-byte identical to pre-B9 | No schema change; `list_own_registrations()` and the response-building code are untouched |
| General regression | Admin dashboard, executive dashboard, communications all load normally | Standard per-slice regression check, same as B6/B7/B8 — unrelated to this endpoint's own authorization path |
| Logs during observation window | Zero `capability_engine_authorization_error` occurrences; any `capability_engine_authorization_denied` entries correspond only to genuinely unauthorized requests | Same log-review discipline as every prior slice |

## 9. Rollback

Single commit, touching exactly `api/dependencies.py` and `api/routers/participant_self.py`. Revert restores `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` on the route and removes `require_capability()`. No migration, no data written or altered by this slice at all — the lowest-risk rollback of any slice so far, on par with B8's.

## 10. Risk assessment

- **Technical risk: Low.** No schema, no migration, one route, one new pure-dependency function reusing an already-proven engine.
- **Operational risk: Moderate**, as the user assessed — this is the first slice where a real authorization outcome could differ from today's if the engine and legacy ever disagreed. §7 is the argument for why that risk is already retired for this specific permission, on this specific endpoint, given B5's equivalence proof and B6's live shadow run.
- **Rollback risk: Very low.** Single dependency swap, no data implications, matches §9.
- **Security risk: Positive**, per the user's framing — the endpoint moves to the canonical capability model, and the new fail-closed-on-error behavior (§6) is strictly more conservative than doing nothing on an unexpected exception.

## 11. The open question: outright replacement vs. temporary dual-decision

**Recommendation: outright replacement, no dual-decision period.** A dual-decision (`legacy THEN capability`, comparing before deciding) is exactly what B6 already did, in production, on this exact endpoint, for this exact permission — running it again here would re-derive evidence B6 already produced rather than adding new evidence. The user's own enforcement-semantics section explicitly asks to avoid patterns that obscure which system is authoritative; a second observation period accomplishes nothing B6 didn't already prove and would blur the "B9 is the first authoritative decision" milestone this slice is supposed to represent.

**This recommendation is conditioned on one fact I can't verify myself: that B6's shadow-check logged zero (or explainably-zero) mismatches during its production observation window.** That data lives in Application Logs, which I don't have access to. Please confirm this before authorizing — if B6 ever logged a real mismatch in production, that changes this recommendation to "dual-decision first," and I'd want to see what caused it before proposing outright replacement.

## 12. Naming collision found during this review — flagging, not fixing without confirmation

`PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md` currently uses "B9" for two different things:
- §"B9 — first authoritative capability decision" (line ~29) — **this document**, the slice the user is now defining.
- The slice-sequence table's row `B9 *(future, not in this rollout)*` — **"Retire `User.role` / `Participant.user_id`"** (line ~83) and its own detail section (line ~182) — a distinct, later, explicitly-deferred slice.

This is the same kind of collision as the "Phase 3C" naming issue resolved on 2026-07-21, just one level down (slice number instead of phase name). The roadmap is the one document in this project explicitly maintained as living (not frozen like the Phase/ADR documents), so fixing this is in-scope for a documentation update rather than an edit to historical record — but I'm flagging rather than silently renumbering, per the same "surface, don't silently fix" instruction used for the `docs/waiver-signing.html` finding.

**Recommendation:** keep "B9" for the slice this document covers (it's already in active use in the roadmap's own prose section and in the user's message), and rename the column-retirement slice to something distinct — e.g. "B10 — Retirement of `User.role` / `Participant.user_id`" — the next open number, still explicitly future and out of scope. I'll make this edit alongside the rest of the roadmap update if approved, not before.

## 13. Summary of what needs the user's decision before implementation

1. Corrections in §3 and §4 — accepted as written, or amended further?
2. §5 — remove the B6 shadow-check call site as part of this slice (recommended), leave it running alongside `require_capability()`, or something else?
3. §11 — confirm B6's production shadow-check logged no real mismatches, supporting outright replacement over a dual-decision period.
4. §12 — approve renumbering the unrelated future "B9" (column retirement) to "B10" in the roadmap, as part of this slice's documentation update.

No code has been written. Awaiting explicit authorization to implement, per standing practice for every high-risk slice this phase.
