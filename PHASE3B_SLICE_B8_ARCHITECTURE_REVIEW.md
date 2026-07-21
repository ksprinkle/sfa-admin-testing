# Phase 3B (Post-Closeout) — Slice B8: Architecture Review

## Status
Mode: Architecture Review Only
Implementation: Not Authorized
Repository Changes: None

Phase 3B was formally declared complete on 2026-07-21 (baseline `v1.39.0-phase3b-b7-identity-write-path`). Per that closeout, B8 requires its own architecture review before any implementation — this document is that review, answering the six questions posed, in order. No code, schema, or router change is proposed for adoption here; this is a design recommendation awaiting authorization.

---

## 1. Which endpoint is the best first candidate?

**Recommendation: extend `GET /auth/me`'s existing response with a new, additive `capabilities` field — not a new endpoint.**

Considered and rejected: a brand-new `GET /api/me/capabilities` endpoint (the roadmap's original sketch). It would have genuinely zero blast radius, but it would also have **zero real traffic** until Phase 3D's frontend starts calling it — meaning it would sit exactly as dormant as B5's engine already is, adding a second dormant artifact rather than actually exercising anything in production. That doesn't satisfy "meaningful production traffic."

`GET /auth/me` (`api/routers/auth.py::get_me()`) is, by contrast, already called on **every session load and refresh in both the admin shell and the participant portal** (`admin-app/src/api/auth.js::fetchMyProfile()`, `admin-app/src/api/portalAuth.js::fetchPortalProfile()`) — real, continuous, high-frequency traffic today, with no new frontend work required to start exercising the new field server-side. Extending it directly means the capability computation runs for real, on real requests, from the moment this ships — the traffic comes from the endpoint's existing popularity, not from a consumer that doesn't exist yet.

This also has direct precedent on this exact endpoint: `UserResponse` already gained `email_verified_at` the same way (an additive field on an existing, already-populated column — see `FEATURE_INVENTORY.md` §1: "the column already existed; `GET /auth/me` just didn't expose it"). B8 is structurally the same move, one field further.

**Clear ownership semantics**: the endpoint is inherently self-scoped — "my own capabilities," no target-person parameter, no cross-person capability resolution. This avoids opening any new authorization surface; it's a read of one's own already-computed permission set, nothing about *other* people's records.

**Small blast radius, precisely bounded**: confirmed by reading the current code —

```python
class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    email_verified_at: datetime | None = None
    class Config:
        from_attributes = True

@router.get("/me", response_model=UserResponse)
def get_me(current_user = Depends(get_current_user)):
    return current_user
```

Two things worth noting precisely, because they shape the implementation:
- `UserResponse` uses Pydantic's `from_attributes=True` (ORM mode), and `get_me()` just returns the raw `User` ORM object. A new `capabilities` field has no corresponding attribute on `User` — so `get_me()`'s body must change from `return current_user` to explicitly constructing the response (adding the computed field alongside the existing ones). This is a small, controlled change to one route's body, not its dependency signature.
- `get_me()`'s only dependency today is `Depends(get_current_user)` — no `db: Session`. Rather than adding a new `Depends(get_db)` parameter (a reasonable option, but a signature change nonetheless), the same technique already proven in B3 applies here: `sqlalchemy.orm.object_session(current_user)` recovers the session already bound to the loaded `User` object, keeping the route's dependency signature completely untouched. Recommended for consistency with the established pattern and to keep the touched surface as small as possible.

---

## 2. What is the enforcement model?

**None. B8 introduces zero enforcement change — it is a pure exposure step, not a staged authority transition.**

`has_permission()` (`api/services/authorization.py`, unmodified since B3) remains the sole authorization gate for every existing endpoint, with no exception. The new `capabilities` field on `/auth/me` is a **read-only projection** of the exact same computation B5 built and B6 already shadow-validated against real production traffic with zero mismatches — it doesn't change what that computation *means*, only where its result becomes visible. Nothing reads this new field to make an access decision; it exists so a future frontend (Phase 3D) has something to build adaptive navigation against, and so a person can eventually see their own effective permissions.

There is deliberately no "staged decision process" toward authority here, because none is needed yet — that question (should the capability engine ever become authoritative for a real endpoint) is a distinct, separate, future decision with its own review, exactly like B9's legacy-field retirement was always kept as its own explicitly-deferred item rather than folded into the slice that made it possible.

---

## 3. How is backward compatibility maintained?

- **Additive field only.** `id`, `email`, `role`, `email_verified_at` are unchanged in name, type, and meaning. Both existing consumers (`auth.js::fetchMyProfile()`, `portalAuth.js::fetchPortalProfile()`) do a plain `fetch` + `res.json()` with no schema validation library involved — confirmed by reading both files — so an unrecognized extra JSON key is silently ignored by both, exactly as it was when `email_verified_at` was added.
- **No router decorator or dependency change.** `Depends(get_current_user)` stays exactly as it is.
- **No change to login, JWT contents, or any permission-string name** — matching every constraint already established for B3 and B6's live-path work.
- **No change to any other endpoint.** Nothing outside `auth.py`'s `get_me()` and `schemas/users.py`'s `UserResponse` is touched.

---

## 4. What is the rollback mechanism?

Revert the single commit that adds the field to `UserResponse` and changes `get_me()`'s body to construct it. Since Phase 3D hasn't started, **nothing consumes this field yet** — rollback has zero data-loss risk and zero behavioral risk, the same property every slice since B1 has had. No migration is involved (no schema/column change — this is a computed, request-time field, not persisted anywhere), so there is no downgrade path to worry about at all.

---

## 5. What telemetry is required?

Given `/auth/me`'s criticality (it gates whether both shells can establish a session at all), the telemetry requirement here is different in character from B6's — B6 logged *disagreements* between two decisions; B8 has no second decision to disagree with, since nothing is being enforced. The equivalent discipline for B8 is **failure isolation, not comparison**:

- The capability computation must be wrapped in its own defensive `try/except`, exactly matching the pattern already proven in B6's shadow-check. If `resolve_capabilities()` (or the `Person`/`PersonRole` lookups underneath it) raises for any reason, `get_me()` must still return `200` with the four existing fields intact — the new field becomes `null`/omitted for that response, and the failure is logged (e.g. `capability_engine_expose_error`, mirroring B6's `capability_engine_shadow_check_error` naming) rather than ever surfacing as a `500` on an endpoint this central. This is the single most important design property of this slice, more important than the field itself.
- No new *comparison* telemetry is needed — there is no legacy computation for `/auth/me`'s capabilities to be checked against; B3/B5/B6 already established that the underlying computation matches legacy role-based permissions faithfully. Re-proving that on every request would be redundant instrumentation for no additional confidence.

---

## 6. What constitutes production acceptance?

- `GET /auth/me` returns `200` with the new `capabilities` field present and correctly populated for both an admin and a participant test account (live check, same technique as every prior slice).
- Both shells (`admin-app`, portal) continue to log in, load their dashboards, and function with **zero observable change** — verified via the existing test suite plus live login checks for both roles.
- **Forced-failure test**: with capability resolution mocked to raise, `GET /auth/me` still returns `200` with the four existing fields correct and the new field gracefully absent/null — proving the defensive wrapping actually works, not just that it was written.
- Full existing test suite: same pre-existing failure count, zero new failures — the standing bar since B1.
- No router, dependency, authorization, or schema change outside `auth.py`/`schemas/users.py` — confirmed by `git diff --stat`, matching the isolation-verification standard used since B4.
- Production deploy log needs no schema-status check beyond the usual `MATCH` (no migration in this slice), plus confirmation via Application Logs that zero `capability_engine_expose_error` entries appear under real traffic during an observation window, mirroring B6's and B7's own acceptance bar.

---

## Architectural rule (added on review, binding for implementation)

**Capabilities are derived runtime state, not API state.** Every request recomputes them fresh:

```
GET /auth/me → resolve user → resolve person → resolve roles → resolve capabilities → serialize response
```

They are never cached and never persisted as part of the `User` model or anywhere else — a pure runtime projection of identity, computed on the way out and discarded immediately after serialization. This keeps B8 architecturally consistent with B5 (`capability_resolution.py` already has no caching or persistence of its own) and avoids ever having a stored capability value silently drift out of sync with the roles/relationships it's derived from.

## Expected diff boundary

Implementation should be strictly confined to `api/routers/auth.py`, `api/schemas/users.py`, plus tests. Any file beyond those three should only ever be in support of serialization or testing — never because `capability_resolution.py` itself needs further changes. Staying within that boundary is itself evidence that B5's abstractions are holding up as designed.

## Summary recommendation

Extend `GET /auth/me` with an additive, defensively-computed `capabilities` field using the already-proven B5 engine and the B3-established `object_session()` technique — no new endpoint, no enforcement change, no router/dependency modification, no migration. This is the smallest possible slice that gives B8 genuine production traffic from day one rather than adding a second dormant artifact alongside B5's. Awaiting authorization before implementation begins.
