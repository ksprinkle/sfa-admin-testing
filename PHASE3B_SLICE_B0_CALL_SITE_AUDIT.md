# Phase 3B — Slice B0: Identity Foundation Call-Site Audit

## Status
Phase: 3B, Slice B0
Mode: Code Inventory Only
Implementation: Not Authorized
Repository Changes: None (no migrations, no models, no endpoints, no behavior changes)

This document is the complete call-site inventory required before B1 begins. Every fact below was confirmed by directly reading the corresponding file in this session — no site is inferred. It maps directly onto [`PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`](PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md)'s entities and feeds the migration-slice column already established there.

---

## 1. Backend Call-Site Inventory

### 1.1 Authentication & session

| File | Function | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/dependencies.py` | `get_current_user` | Decodes JWT `sub` claim → `User.id`, loads `User` fresh from DB every request | Resolves `User` → its `Person` (via new relationship) once B1 lands | B1 | No change to the function's external contract — callers keep getting a `User` back; a `.person` accessor is additive. |
| `api/dependencies.py` | `get_current_user_optional` | Same as above, returns `None` on missing/invalid token instead of raising | Same evolution as above | B1 | Used by feedback submission and public registration for optional attribution — unaffected by identity changes beyond what `get_current_user` gets. |
| `api/routers/auth.py::login` | JWT issuance | Embeds `{"sub": str(user.id), "role": user.role}` in the token payload | — | B3 (decision point) | **Finding**: the `role` claim in the JWT payload is written at login but never read back — `get_current_user` only decodes `sub` and reloads `User.role` fresh from the DB every request. This claim is already dead weight today. Once `PersonRole` allows multiple roles, this single-string claim can't represent that faithfully — recommend simply dropping it in B3 rather than trying to keep it in sync (there is no current reader to break). |
| `admin-app/src/api/auth.js`, `admin-app/src/api/portalAuth.js` | session storage | `localStorage` token/profile pairs, independent per shell | Unaffected | N/A | Confirmed: neither reads `role` for gating logic, only for display (`TopBar.jsx` line 47, label only). No frontend session-management change required by B1–B8. |

### 1.2 Authorization / permission resolution

| File | Function | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/services/authorization.py::has_permission` | `permission in permissions_for_role(user.role)` | Single `user.role` string | Union of active `PersonRole` grants, with fallback | **B3** | This is the one central function B3 changes — every `require_admin`/`require_permission(...)` call site downstream is unaffected in its own code, since they all call through this one function. |
| `api/services/authorization.py::permissions_for_role`, `normalize_role`, `is_supported_role`, `get_authorization_matrix` | Role-string helpers | Operate on a single string | Operate on `Role` lookup rows (code/display_name) once B1's `roles` table exists | B1 (schema) / B3 (behavior) | `get_authorization_matrix()` backs `GET /admin/permissions/matrix` (admin UI) — response shape can stay identical if `Role` rows mirror today's two string keys. |
| `api/dependencies.py::require_admin`, `require_permission(...)` | FastAPI dependencies, call `has_permission` | Unchanged | Unchanged | N/A | Confirmed: these two dependencies are the *only* enforcement points across all 18 routers that import them (`auth.py`, `participant_self.py`, `events.py`, `waivers.py`, `notification_read_state.py`, `admin_communications.py`, `admin_audit.py`, `admin_participants.py`, `feedback.py`, `admin_analytics.py`, `admin_dashboard.py`, `admin_event_operations.py`, `admin_volunteers.py`, `admin_automation.py`, `admin_permissions.py`, `admin_waiver_templates.py`, `admin_events.py`, `admin_event_templates.py`) — no router bypasses them with an inline `role ==` check. This is good news for B3: exactly one function needs to change to affect all enforcement uniformly. |

### 1.3 Role-mutation endpoints (new finding — needs design attention in B3, not just data migration)

| File | Endpoint | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/routers/auth.py::update_user_role` | `PUT /auth/admin/users/{user_id}/role` | `user.role = new_role` (overwrite) | Grant/revoke a specific `PersonRole` | **B3** | **Finding**: three separate endpoints all implement "overwrite the one role" semantics. Once `PersonRole` is multi-valued, "set the role" isn't a well-defined operation anymore — this needs an explicit product decision in B3 (e.g., separate grant/revoke endpoints, or a "set active roles to this list" endpoint), not a mechanical search-and-replace. Flagged as a B3 design note, not a blocker to B1/B2. |
| `api/routers/auth.py::update_user_role_by_email` | `PUT /auth/admin/users/by-email/role` | Same overwrite semantics, looked up by email | Same | **B3** | Confirmed unused by the frontend (see §2) — only `permissions.js` calls the other two. Candidate for retirement rather than migration once B3 lands, pending confirmation it has no other caller (e.g. a script or external integration). |
| `api/routers/auth.py::update_user_role_by_email_body` | `PUT /auth/admin/users/by-email/role-body` | Same overwrite semantics, JSON body | Same | **B3** | Called by `PermissionsManagement.jsx`. |
| `api/routers/auth.py::list_users` | `GET /auth/admin/users?role=` | Filters `User.role == role` | Filters via `PersonRole` join | **B3** | Straightforward query rewrite once `PersonRole` exists — no design ambiguity here, unlike the mutation endpoints above. |

### 1.4 Registration ownership (`Participant.user_id`)

| File | Function | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/services/public_registration.py::register_public_participant` (line ~44) | Sets `Participant.user_id` | `if current_user is not None and normalize_role(current_user.role) == ROLE_PARTICIPANT` | Sets `Participant.person_id` alongside (parallel write) | **B7** | The exact call site that decides whether a new registration gets linked to an account — this is where B7's parallel `person_id` write is added. |
| `api/services/participant_identity.py::get_own_participant_or_404`, `list_own_registrations` | Ownership check | `Participant.user_id == current_user.id` / `.filter(Participant.user_id == current_user.id)` | `resolve_capabilities()` (B5), shadow-checked first (B6) | **B6 → later** | Confirmed as the two functions backing `GET /participants/mine` and `GET /participants/{id}` (via `api/routers/participant_self.py`) — this is B6's target endpoint exactly as planned. |
| `api/services/participant_claiming.py::claim_participants_for_user` | Claiming | Exact-email match against `Participant.email` where `user_id IS NULL` | Also creates/attaches `PersonRelationship` when a different kind of match applies | **B7** | Already the mechanism 3A §1.5 identified as too narrow (same-email-only). |

### 1.5 Waiver ownership

Already fully inventoried in `PHASE3_DIGITAL_DOCUMENTS_PLATFORM_ARCHITECTURE_REVIEW.md` §1.1–1.2 — not re-derived here. Relevant to B0: `ParticipantWaiver` has no identity FK of its own; it inherits ownership through `Participant.person_id` once that column exists (B2), consumed by Phase 3C, not this roadmap.

### 1.6 Feedback ownership

| File | Field | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/models/feedback.py` | `Feedback.submitted_by_user_id` | Nullable FK → `User` | → `Person` | Matches `PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md` exactly — straightforward retarget, no new finding. |

### 1.7 Notification ownership

| File | Field | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/models/notification_read_state.py` | `NotificationReadState.user_id` | Non-nullable FK → `User`, unique with `notification_key` | → `Person` | Matches the ownership audit — straightforward retarget. `api/services/notification_read_state.py`'s three functions (`list_read_notification_keys`, `upsert_read_notification_keys`, plus the router) all take `user_id` as a plain parameter, not a `User` object — the retarget is a rename at the call boundary, not a structural change. |

### 1.8 Audit / attribution ownership

| File | Field | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/models/admin_audit_events.py` | `AdminAuditEvent.actor_user_id` | FK → `User` | **Stays on `User`** | N/A | Per the ownership audit's subject-ownership-vs-actor-attribution distinction — this is "who was logged in," not "whose record is this." Confirmed extensively used as `actor_user_id=str(getattr(current_user, "id", ...))` across `admin_participants.py` (waiver verify/reset, removal, promote, assign-session), `auth.py` (role changes), `participant_claiming.py` — all correctly actor-attribution, not subject-ownership. No migration needed per the constraint in §1.1 of the roadmap. |
| `api/models/participants.py` | `Participant.verified_by_user_id` (via `ParticipantWaiver`), `removed_by_user_id` | FK/plain string → `User` | Stays on `User` | N/A | Same reasoning — "who verified/removed this," not "whose record is this." |
| `api/models/communication_messages.py` | `CommunicationMessage.created_by_user_id` | FK → `User` | Stays on `User` | N/A | Confirmed directly in the model — the message's *author*, not its recipient. Matches the ownership audit's note about `CommunicationDelivery.recipient` being the actual (currently unmodeled) subject-ownership gap, not this field. |

### 1.9 Timeline ownership

| File | Function | Current dependency | Future dependency | Slice | Notes |
|---|---|---|---|---|---|
| `api/services/event_operations_timeline.py` | `_build_waiver_verification_entries` and siblings | Reads `Participant`/`ParticipantWaiver` directly, no `user_id`/`role` dependency | Unaffected until `Participant.person_id` becomes the canonical read path (post-B7) | Later (post-roadmap) | No identity-model coupling found — this timeline is keyed entirely on `Participant`/`Event`, not on any `User`/role concept. |
| `api/services/participant_timeline.py` | Waiver/PDF entry builders | Same — reads `ParticipantWaiver`/`waiver.pdf_artifacts`/`waiver.audit_events` | Unaffected similarly | Later | No identity-model coupling found. |

### 1.10 Explicitly out of scope — `Participant.role`

**Important disambiguation, not previously called out this explicitly**: `Participant.role` (values `"participant"`/`"surfer"`/`"volunteer"`) is a **different field from `User.role`** — it describes what kind of registrant a given event roster row represents, not an identity/permission role. Confirmed sites: `api/models/events.py` (surfer-count computation), `api/utils/event_counts.py` (checked-in/waitlist/volunteer counts), `api/schemas/participants.py` (role-normalization validators). **None of these are part of the identity migration** — they stay exactly as they are. Flagging this explicitly because the shared field name (`role`) on two different models is an easy point of confusion during B3 implementation.

---

## 2. Frontend Call-Site Inventory

| Area | File(s) | Current assumption | Impact | Notes |
|---|---|---|---|---|
| Admin session | `admin-app/src/api/auth.js` | `token`/`auth.profile` in `localStorage`, `auth:changed` event | Unaffected through B8 | No role-based gating logic found in this file — it's pure token storage. |
| Portal session | `admin-app/src/api/portalAuth.js` | `portal.token`/`portal.profile`, `portal-auth:changed` event, reuses `/api/auth/login` and `/api/auth/me` as-is | Unaffected through B8 | Explicitly documents its own isolation rationale in a code comment — confirms 3A's characterization directly from source. |
| Role display (not gating) | `admin-app/src/components/TopBar.jsx` (line 47) | Displays `profile?.role \|\| "admin"` as a label | Cosmetic only | Confirmed — no conditional rendering keyed off this value in the file. |
| Route gating | `admin-app/src/App.jsx` | `if (!token)` redirect, plus a `/portal` path-prefix branch — confirmed no `role ===` checks anywhere in this file | Unaffected through B8 | Matches `ARCHITECTURE_OVERVIEW.md`'s description exactly; gating is entirely token-presence + backend 403s, not client-side role logic. |
| Role assignment UI | `admin-app/src/pages/PermissionsManagement.jsx`, `admin-app/src/api/permissions.js` | Calls the two "overwrite role" endpoints (§1.3) | **Needs a UI redesign once B3's endpoints change shape** (single-select → grant/revoke or multi-select) | Backend contract only through B3; actual component change is Phase 3D-adjacent, not required for B1/B2/B4/B5. |
| Participant role badges | `Participants.jsx`, `EventDetail.jsx`, `FastAssign.jsx`, `CheckIn.jsx`, `ParticipantForm.jsx`, `Events.jsx`, `AuditLog.jsx` | Read `participant.role` (surfer/volunteer/participant) for badges/filters/capacity logic | **Unaffected** — this is `Participant.role`, not `User.role` (see §1.10) | Confirmed via grep that all matches in these files are the registration-type field, not the identity field. |
| My Registrations | `admin-app/src/pages/PortalMyRegistrations.jsx` | Consumes `GET /api/participants/mine`'s `waiver_status` string | Backend contract only — response shape unchanged through B7 | No frontend change required by this roadmap; only relevant once a future slice changes what `waiver_status`/ownership means. |

**Conclusion for §2**: no frontend code changes are required by B1 through B8. Every genuine frontend touchpoint identified (`PermissionsManagement.jsx`'s role-assignment UI, and eventually an adaptive navigation) is either gated on B3's redesigned role-mutation endpoints or is explicitly Phase 3D scope.

---

## 3. API Surface Inventory

| Endpoint | Exposes | Current shape | Future compatibility | Notes |
|---|---|---|---|---|
| `POST /auth/login` | JWT with `sub`+`role` claims | Single role string in token payload | No change needed — recommend simply dropping the unused `role` claim in B3 rather than evolving it (see §1.1) | Confirmed unread by any decoder in the codebase. |
| `GET /auth/me` | `UserResponse` (includes `role`, `email_verified_at`) | Single role string | Additive — could gain a `roles: [...]` list or a nested `person` object without breaking existing consumers, since JSON field addition is non-breaking | Candidate landing spot for B8's capability contract instead of (or alongside) a brand-new endpoint — a decision for B8, not fixed here. |
| `GET /admin/permissions/me` | `{user_id, role, permissions}` | Single role string + resolved permission list | **This is an existing precedent for exactly what B8 is building** — already returns a resolved permission list today, just from one role instead of a union | Worth deciding in B8 whether this endpoint evolves into the capabilities contract or a new endpoint is added alongside it — flagged here as a discovered option, not decided. |
| `GET /admin/permissions/matrix` | Full role→permission matrix (`get_authorization_matrix()`) | Two hardcoded role keys | Becomes data-driven once `Role` (B1) exists | Response shape can stay identical if `Role` rows mirror today's two keys exactly. |
| `PUT /auth/admin/users/{id}/role`, `.../by-email/role`, `.../by-email/role-body` | Role mutation | Overwrite semantics | **Contract evolution required in B3** (see §1.3) — not preservable as-is once multi-role exists | The one place in the entire API surface where "future compatibility" isn't a simple additive change. |
| `GET /auth/admin/users?role=` | User list filter | `User.role == role` | Query rewrite against `PersonRole`, same response shape | No ambiguity, unlike the mutation endpoints. |
| `GET /api/participants/mine`, `GET /api/participants/{id}` | `MyRegistrationOut`/`ParticipantOut` | Scoped by `Participant.user_id == current_user.id` | Response shape unchanged; only the internal ownership check evolves (B6 shadow-check, later cutover) | Confirmed no `user_id`/`role` field is present in `MyRegistrationOut`'s response body itself — nothing here is even client-visible today. |
| `POST /api/public/events/{slug}/register` | Registration + waiver issuance | Uses `current_user.role` to decide `Participant.user_id` linkage | Parallel `person_id` write added in B7; response shape unchanged | See §1.4. |

**Conclusion for §3**: no endpoint response shape needs to change for B1 through B8 except the three role-mutation endpoints (§1.3), which were already known to need redesign once multi-role support exists — this doesn't block schema work, it's a B3 implementation detail to design carefully when that slice starts.

---

## 4. Roadmap Annotations

Recorded here as annotations to [`PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md`](PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md) — none of these change that document's approved sequencing, they clarify scope within it:

1. **B3 now has a known design sub-problem**: the three role-mutation endpoints (§1.3) implement single-role overwrite semantics and need an explicit grant/revoke (or equivalent) redesign, not a mechanical retarget. This is additional detail for B3, not a new slice and not a blocker to B1/B2.
2. **`GET /admin/permissions/me` is a viable extension point for B8** rather than a reason to build an entirely new endpoint from scratch — noted as an option for that slice to evaluate, not decided here.
3. **The JWT's `role` claim is already dead code** (written, never read) — B3 can simply drop it rather than evolve it.
4. **`Participant.role` and `User.role` are unrelated fields that happen to share a name** — worth a one-line callout in B3's own slice description so future implementers don't conflate them (no code impact, a documentation clarity note only).

No other annotations are needed — B1, B2, B4, B5, B6, and B7's descriptions in the roadmap already match what this audit found at the relevant call sites exactly.

---

## 5. Validation

- **Every identity dependency found maps cleanly onto an existing row in `PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`** — Registration, Waiver, Feedback, Communication (message vs. delivery, matching the audit's own author/recipient distinction), Notification, Volunteer, Sponsor, Emergency Contact, Household. No entity was found during this audit that isn't already represented there.
- **No ownership assumption was found outside the two categories the ownership audit already distinguishes** (subject ownership vs. actor attribution) — every `*_user_id` field encountered sorted cleanly into one of the two.
- **No new architectural issue was discovered.** The role-mutation-endpoint finding (§1.3/§4) is a real implementation complexity for B3, not a conflict with the approved Person/PersonRole/PersonRelationship design — multi-role support was always going to require redesigning "set the one role" into something else; this audit just confirms exactly which three endpoints that touches and that no other endpoint has the same problem.

---

## 6. Summary of Findings

- 18 routers use `require_admin`/`require_permission`, all funneling through exactly one function (`authorization.py::has_permission`) — B3 has a single, well-isolated point of change for enforcement.
- Registration ownership (`Participant.user_id`) has exactly three call sites: the write path (`public_registration.py`), the read path (`participant_identity.py`, both `GET /participants/mine` and `GET /participants/{id}`), and the claiming path (`participant_claiming.py`) — matches the roadmap's B6/B7 targets exactly, no additional site found.
- Frontend requires zero changes through B8 — confirmed no client-side role-gating logic exists anywhere in the admin or portal shells; all access control is server-enforced.
- One genuinely new finding: three role-mutation endpoints need a real design decision in B3 (grant/revoke semantics), not just a data retarget — flagged as a B3 annotation, not a blocker.
- One reuse opportunity surfaced: `GET /admin/permissions/me` is a close precedent for B8's planned capabilities contract.
- `Participant.role` vs. `User.role` name collision is real but harmless — confirmed no code conflates them today; flagged purely so B3 doesn't introduce confusion.

## 7. B1 Sequencing Confirmation

**B1 sequencing remains valid, unchanged.** Nothing found in this audit conflicts with adding `Person`/`Role` as purely additive tables with a 1:1 backfill from `User`. The only design-affecting finding (role-mutation endpoints) belongs to B3, which was already the slice where `PersonRole` behavior lands — no re-sequencing is required.

This audit is complete. Awaiting approval before beginning B1.
