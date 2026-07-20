# Phase 3A — Unified Identity & Household Architecture Review

## Status
Phase: 3A Architecture Review
Mode: Planning Only
Implementation: Not Authorized
Repository Changes: None (backend/frontend/migrations/models untouched by this document)

This document reviews the current identity model and proposes a unified Person/Role/Household architecture to unblock the Digital Documents Platform (paused per [`PHASE3_DIGITAL_DOCUMENTS_PLATFORM_ARCHITECTURE_REVIEW.md`](PHASE3_DIGITAL_DOCUMENTS_PLATFORM_ARCHITECTURE_REVIEW.md)) and every future portal/role this platform is likely to need. It contains no code, no migrations, no new models, and no documentation changes outside this review.

---

## 1. Current Architecture Inventory

### 1.1 `User` — the only identity table

`api/models/users.py`, in full:

```
id (String, PK, app-generated str(uuid.uuid4()))
email (String, unique, indexed)
hashed_password
role (String, default "participant")
is_active (Boolean)
email_verified_at (DateTime, nullable)
```

That is the entire table. Notably: **no name, no phone, no date of birth — no profile data of any kind.** `User` is purely a credential + role record. `User.id` is a plain `String` (not the `UUID` column type every other model's PK uses) — a known, documented inconsistency (`KNOWN_TECHNICAL_DEBT.md`), and one every FK-to-`users.id` column already has to match (`ParticipantWaiver.verified_by_user_id`, `Participant.user_id`, `VolunteerProfile.created_by_user_id`, etc.).

### 1.2 `Participant` — where profile data actually lives

`api/models/participants.py` carries `first_name`/`last_name`/`email` **per event registration row**, not once per person. A parent registering the same child for three events today gets three `Participant` rows, each with its own copy of that child's name/email — there is no single record representing "this child" independent of a specific event's roster.

`Participant.user_id` (nullable `String` FK → `users.id`) is the one existing identity link: it connects a roster row to the `User` account that self-registered it. Set only when the caller is authenticated as `participant` at the moment of public registration (`public_registration.py::register_public_participant()`); null for admin-created rows and anonymous registrations.

### 1.3 Authentication

Stateless JWT via OAuth2 password flow (`POST /api/auth/login`, `python-jose`, HS256). `api/dependencies.py::get_current_user` decodes the token and loads the `User` row on every request — no session cache, no refresh tokens, no revocation. `get_current_user_optional` returns `None` instead of raising when a token is missing/invalid, used by endpoints that must stay reachable anonymously but should attribute identity when available (e.g., public registration).

### 1.4 Hybrid Participant Account Model (existing partial solution)

Shipped in slices (documented in `FEATURE_INVENTORY.md` §1/§13/§14): a `participant`-role `User` can self-register, and the resulting `Participant.user_id` link lets `GET /api/participants/mine` show that account's own registrations. This is explicitly described everywhere in this codebase as a "foundation," not a complete identity model — family/guardian accounts were deliberately deferred at each slice.

### 1.5 Historical Registration Claiming

`api/services/participant_claiming.py::claim_participants_for_user()` — on email verification, finds every `Participant` row with `user_id IS NULL` whose email **exactly equals** (after normalization) the verifying user's own email, and links it. This is the *only* mechanism today by which one account can end up associated with more than one registration, and it only works when every registration was submitted with the literal same email address as the account. A parent who registers three children under three different child-specific email addresses gets zero automatic linkage between their account and any of them — the claiming logic has no way to know they're related at all.

### 1.6 Permissions

`api/services/authorization.py` is a **hardcoded, in-code dictionary** (`ROLE_PERMISSIONS: dict[str, set[str]]`), not a database table. Two roles exist today: `participant` (→ `participants.view_own`, `waivers.view_own`) and `admin` (→ nine `*.manage`/`admin.access`/`*.read` permission strings). `has_permission(user, permission)` reads `permissions_for_role(user.role)` — **a single string field**, so a `User` can hold exactly one role at a time, by construction. Two permissions are defined and granted but never consumed by any endpoint (`waivers.view_own`, `waivers.manage`) — a repeated "defined ahead of being wired up" pattern already present twice in one feature area (see the Phase 3 review, §1.5).

### 1.7 Relationships between entities today

```
User (1) ──── (0..N) Participant   [Participant.user_id, nullable]
User (1) ──── (0..N) VolunteerProfile   [only via created_by_user_id/updated_by_user_id — audit metadata, NOT ownership]
```

`VolunteerProfile` (`api/models/volunteer_profiles.py`) has **no `user_id` at all** — it is entirely disconnected from the authentication system. A volunteer cannot log in and see their own assignments today; only staff manage `VolunteerProfile` rows via the admin app. This is the same "two parallel volunteer concepts" gap already flagged in `KNOWN_TECHNICAL_DEBT.md` (`VolunteerProfile`/`VolunteerAvailability`/`VolunteerAssignment` vs. `Participant(role="volunteer")`), now visible from the identity side too: neither volunteer representation has a real person behind it.

There is **no Guardian model, no Household model, and no relationship-type concept anywhere in the schema.** The only thing standing in for "these registrations belong together" is the email-match coincidence described in §1.5.

### 1.8 Strengths

- The JWT/permission-string enforcement mechanism itself (`require_admin`/`require_permission(...)`) is simple, consistent, and well-understood across the codebase — worth keeping unchanged as the *enforcement* layer even as *what feeds it* changes.
- Row-level ownership is already correctly handled at the service layer, not baked into the permission string (`participant_identity.py`'s `Participant.user_id == current_user.id` check, returning 404 rather than 403 for someone else's record) — this pattern generalizes directly to a person/relationship model.
- The claiming mechanism, while narrow, establishes a proven shape worth reusing: self-service registration now, formal account linkage later, applied automatically and idempotently, with a full audit trail (`AdminAuditEvent`, `action="participant_account_claimed"`).
- The project has already built one generic, purpose-discriminated, reusable identity-adjacent primitive: `UserActionToken` (hashed/single-use/expiring, with a `purpose` column) — evidence this team already reaches for generalization when a second use case appears, which is exactly the instinct this review continues.

### 1.9 Limitations

- **A person can hold only one role.** A staff member who is also a parent registering their own child, or a volunteer who later becomes a participant, needs two separate accounts today — there is no way to represent both simultaneously on one `User` row.
- **No canonical "person" exists independent of a role-specific record.** Name/contact data is duplicated per `Participant` row (once per event) and separately again on `VolunteerProfile`, with no shared identity tying them together even when they're the same human being.
- **Family/household relationships have no representation at all** — not a single-parent-child assumption to loosen, but a complete absence. Grandparents, foster parents, caregivers, emergency contacts, and organizational sponsors/coordinators have no path into this model whatsoever today.
- **Permissions are a hardcoded dictionary**, not data — adding a role requires a code change and deploy, not a data row.
- **No event-scoped or relationship-scoped permission concept exists** — authorization today is binary: global admin, or a fixed, un-scoped participant self-service set.

---

## 2. Identity Model Recommendation

### 2.1 Should `User` become `Person`, or should `Person` exist alongside `User`?

**Recommendation: `Person` exists alongside `User`, as the anchor identity — `User` narrows to mean "a set of login credentials."**

Rationale: a person conceptually exists before they ever have login credentials — a parent registers a child who has no account of their own; a group home lists residents who will never log in; an emergency contact may never be anything but a name and phone number attached to someone else's record. Making `User` (a row that requires a password hash) the anchor would force every non-authenticating identity to either not exist in the model at all (today's situation) or to get a synthetic, credential-less `User` row just to have an identity (an awkward fit for a table whose whole reason for existing is "how do you log in").

`Person` becomes the durable anchor: every human the platform knows about (participant, volunteer, guardian, sponsor, staff, emergency contact) is a `Person` row. `User` becomes an **optional**, at-most-one-per-`Person` credential attachment — a `Person` may have zero `User` rows (a minor, an emergency contact who never logs in) or exactly one (anyone who creates an account). This directly mirrors the shape `Participant.user_id` already uses today (a per-record optional link to an authenticating account) — just relocated one layer down, onto the durable identity instead of the per-event roster row.

This is consistent with this project's stated engineering philosophy (`CLAUDE.md` Mandatory Engineering Rule #1: "Preserve existing architecture; extend rather than replace it") — `User` keeps its exact current job (authentication) and every existing FK to `users.id` keeps working unchanged during migration; `Person` is purely additive at first.

### 2.2 Identity lifecycle

A `Person` can be created three ways, matching real registration patterns:
1. **Self-registration** — someone creates a `User` account directly; a 1:1 `Person` is created alongside it (today's flow, unchanged in mechanism).
2. **Registered by someone else** — a guardian fills out a registration form for a child; a `Person` is created for the child with no `User` attached, and a `PersonRelationship` (§3) links the guardian's `Person` to the child's.
3. **Later self-claiming** — a `Person` created without a `User` (case 2) can later gain one, exactly as today's claiming mechanism works, generalized: when a new `User` is created whose email matches a `Person`'s stored email (or, better, when an *existing* relationship already names them), attach the `User` to the *existing* `Person` rather than creating a duplicate — no identity discontinuity, no re-creating registration/document history.

### 2.3 Authentication

Unchanged mechanism: JWT/OAuth2 password flow authenticates a `User` row exactly as today. The only conceptual shift is what the token resolves to downstream — `get_current_user()` continues to load the `User`, and now additionally resolves `current_user.person` for anything that needs the durable identity (roles, relationships, cross-event history). No new login endpoint, no new token format, no change to `admin-app/src/api/auth.js`/`portalAuth.js`'s actual request shape.

### 2.4 Profile ownership

`Person` becomes the canonical owner of identity-level profile fields (name, date of birth, phone) that today don't exist anywhere except duplicated per `Participant`/`VolunteerProfile` row. Event-specific or role-specific records (`Participant`, `VolunteerProfile`) reference `person_id` and keep only what's genuinely per-registration (which session, which role at that event, waiver status for that registration) — not a second copy of the person's name. (Full removal of the now-redundant name fields on `Participant`/`VolunteerProfile` is a larger, separate migration; flagged in §8 as a backward-compatibility concern, not assumed away here.)

### 2.5 Email ownership

`Person` owns the canonical `email` used for matching/communication/claiming (this is the field the generalized claiming logic in §2.2 matches against). `User.email` remains the login identity and, for the common case of a self-registering adult, is simply the same value as their `Person.email` — no dual-entry required in the normal case. A `Person` with no `User` (a child, an emergency contact) still has an `email` field on `Person` for communication purposes even though it can never log in.

### 2.6 Login strategy

No change. One login endpoint, one token format, already role-agnostic today (`PortalLogin.jsx` already reuses the exact same `POST /api/auth/login` the admin app uses — confirmed working proof that this mechanism doesn't need to know about portals or roles at the auth layer). What changes is entirely downstream of authentication: what the resolved identity is allowed to see and do (§6–§7).

---

## 3. Household / Family Model

### 3.1 Design: a grouping construct plus a typed relationship graph, not a parent-child tree

Two new concepts, deliberately separated:

- **`Household`** — a lightweight, optional named grouping (`id`, `name`, `created_at`). Not required for every `Person`. Represents whatever grouping makes sense for the context — a family, a group home, a school classroom, a sponsor organization. It is a label and a convenience view, never an owner of records (see §5).
- **`PersonRelationship`** — the actual mechanism. A many-to-many join between two `Person` rows: `subject_person_id`, `related_person_id`, `relationship_type` (an open string/lookup value, not a hardcoded enum — `parent`, `legal_guardian`, `foster_parent`, `caregiver`, `emergency_contact`, `sibling`, `case_worker`, `group_home_staff`, `sponsor_contact`, `teacher`, etc.), an explicit set of **capability flags** (`can_register_for`, `can_view_documents`, `can_manage_documents`, `can_receive_communications`, `is_emergency_contact_only`), an optional `household_id`, `status` (`active`/`revoked`), and optional `verified_at`/`verified_by_user_id` for cases where a relationship's legal standing (a legal guardian, a foster placement) may eventually need confirmation.

**Why capability flags instead of inferring behavior from `relationship_type` alone:** this codebase has already been burned by overloading a single field with implied meaning it can't reliably carry (`ParticipantRemovalLog.event_id` stored as untyped text is flagged in `KNOWN_TECHNICAL_DEBT.md` as exactly this class of mistake). Real guardianship arrangements vary — a court order might grant one parent full access and another view-only or none at all; an emergency contact should almost never have document-management rights. `relationship_type` supplies a sensible **default** capability set at creation time; the capability flags are what's actually checked, and they're explicit, auditable, and independently revisable per relationship, not implied.

### 3.2 Coverage of the requested scenarios

| Scenario | Representation |
|---|---|
| Grandparent registering grandchildren | `PersonRelationship(relationship_type="guardian", can_register_for=true)`, no `Household` required |
| Foster parent / legal guardian | `relationship_type="foster_parent"`/`"legal_guardian"`, `verified_at` populated once confirmed |
| Adult participant with a caregiver | `subject_person_id` = the participant's own `Person` (not a "child"), `relationship_type="caregiver"` |
| Group home / residential facility | `Household` represents the facility; staff `Person`s linked to resident `Person`s via `relationship_type="group_home_staff"`, `can_register_for=true` |
| School teacher coordinating multiple students | A relationship web with no `Household` needed — many-to-many, not a tree |
| Veteran support / sponsor organization | `Household` represents the org; members linked via `relationship_type="sponsor_contact"`/`"org_member"` |

Because `PersonRelationship` is many-to-many, **multiple guardians per child and multiple children per guardian both fall out for free** — no special-casing for blended families, co-parents with different surnames/emails, or a child with more than one registered guardian.

### 3.3 How permissions flow through relationships

A relationship's capability flags are evaluated at the service layer, generalizing today's `Participant.user_id == current_user.id` row check into: *"is the caller the same `Person` as the record's owner, OR does an active `PersonRelationship` from the caller's `Person` to the owner's `Person` grant the specific capability this action requires?"* This is additive to the existing ownership-check pattern (§1.8), not a new enforcement mechanism.

---

## 4. Role Model

### 4.1 Representation

Replace `User.role` (single string) with **`PersonRole`** — a join table: `person_id`, `role` (recommend a `Role` lookup table — `code`, `display_name` — rather than a hardcoded string, matching the same reasoning as the Phase 3 review's `DocumentType`-as-a-table recommendation: new roles should be a data row, not a code change), `granted_at`, `granted_by_user_id`, `status` (`active`/`revoked`), and an optional `scope` (see §7 — event-scoped roles).

A `Person` holds however many active `PersonRole` rows apply — participant, volunteer, parent, sponsor, staff, and admin are no longer mutually exclusive. `authorization.py::has_permission()` (today: `permission in permissions_for_role(user.role)`, a single lookup) becomes a union: `permission in union(permissions_for_role(r) for r in person.active_roles)`. The permission-string catalogue and the `require_permission(...)` enforcement dependency stay exactly as they are — only the cardinality of "which role set feeds this check" changes.

### 4.2 Avoiding role-specific account duplication

This is precisely what `Person` + `PersonRole` are for: one `Person`, N `PersonRole` rows, N optional role-specific records (`Participant`, `VolunteerProfile`) that all key off the same `person_id`. No `VolunteerUser`, no `SponsorAccount` — a second credential/account type per role is exactly the anti-pattern this model exists to avoid.

---

## 5. Ownership Rules

A firm, explicit rule worth stating up front: **every legally/operationally meaningful record belongs to a `Person`, never to a `Household`.** A household cannot sign a waiver or receive a check-in; a person can. `Household` is a display/communication/administrative convenience — a saved view over its members — never itself an owner.

| Resource | Owner | Notes |
|---|---|---|
| Event registrations (`Participant`) | The subject `Person` (the registrant themselves) | Recommend splitting today's single `user_id` into `person_id` (who this registration is *about*) and `registered_by_person_id` (who *submitted* it) — today's model conflates these two, which is exactly why a parent registering a child under the child's own email breaks claiming (§1.5). |
| Volunteer assignments | The volunteer's own `Person` | Requires adding `person_id` to `VolunteerProfile` — closes the "two parallel volunteer concepts" gap (`KNOWN_TECHNICAL_DEBT.md`) as a side effect, since both `VolunteerProfile` and `Participant(role="volunteer")` can now key off the same `Person`. |
| Digital documents (Phase 3 `DocumentInstance`) | The subject `Person` | A guardian's ability to view/sign on a child's behalf is a `PersonRelationship` capability check, **not** a fourth parallel owner-FK as tentatively proposed in the Phase 3 review — this is a strictly better fit and confirms that review's decision to pause was correct. |
| Communications | Addressed to a `Person`; a `Household` may be a convenient *distribution list*, never a delivery/consent record itself | Consent and delivery tracking stay per-person. |
| Feedback | The submitting `Person` | Same as today's `submitted_by_user_id`, generalized. |
| Emergency contacts | A `PersonRelationship` (`relationship_type="emergency_contact"`) | **Net new** — confirmed by direct inspection of `api/models/participants.py`: there are no emergency-contact fields on `Participant` today (no free-text fields to migrate away from), so this is pure greenfield modeling, not a data migration off an existing ad hoc field. |
| Household membership management | Gated by relationship capability (e.g., only relationships with `can_manage_household=true`, typically `parent`/`legal_guardian`) | Not open to every relationship type by default. |

---

## 6. Portal Strategy

### 6.1 The tension

Today's architecture (`ARCHITECTURE_OVERVIEW.md`) is two entirely separate React route trees — the admin shell and the `/portal` shell — with independent `localStorage` session keys (`token`/`auth.profile` vs. `portal.token`/`portal.profile`) and independent change-events (`auth:changed` vs. `portal-auth:changed`), deliberately designed so neither can affect the other. Once a `Person` can hold multiple simultaneous roles (§4), this hard split becomes actively wrong for a real case this project will hit: a staff member who is also a parent registering their own child needs two separate logins and never sees a unified view of their own household alongside their work tools.

### 6.2 Option A — separate portals (status quo, extended)

Keep spinning up a new isolated portal per audience (volunteer portal, sponsor portal, etc.), each its own shell/session. **Advantage:** simplest possible security boundary — a bug in one shell structurally cannot reach another, since they don't share code paths, session state, or even a bundle. **Disadvantage:** doesn't scale with multi-role people at all — the exact problem above — and multiplies session-management code (already duplicated once, between `auth.js` and `portalAuth.js`) with every new portal.

### 6.3 Option B — one authenticated experience, role-based navigation

Single session, single token, navigation and visible sections driven by the authenticated `Person`'s aggregate role set. A parent-and-volunteer sees both their household and their volunteer shifts in one place; a role change (participant becomes a volunteer) needs no new login flow. **Advantage:** matches the actual multi-role reality this review is designing for, and eliminates the current session-management duplication entirely. **Disadvantage:** the entire security boundary between "ordinary end user" and "administrative staff" collapses onto correct, exhaustive permission-checking of every single route/component — there is no longer a separate bundle/shell as a backstop if one check is missed. That is a materially higher bar for a codebase that (per `KNOWN_TECHNICAL_DEBT.md`) has thin test coverage on exactly the routers this would touch (participants, waivers) and no CI to catch a missed check before it ships.

### 6.4 Recommendation — a hybrid, chosen for this project's specific risk profile

**Keep the admin/operational shell isolated exactly as it is today** — the audience (vetted, paid staff handling liability-sensitive data) and the stakes justify the extra isolation, and it costs nothing extra since it already exists. **Unify everything that is not administrative staff tooling** (participant, volunteer, parent/guardian, sponsor) into the single `Person`-based, role-driven experience described in Option B. This captures most of B's benefit for the actually-growing population (end users accumulating multiple roles over time) while preserving A's existing, already-hardened boundary specifically around the one surface (admin) where this project has consistently chosen defense-in-depth over convenience elsewhere (fail-closed production guardrails, guarded migrations). Public, unauthenticated pages (anonymous event browsing, pre-account registration) remain a stateless, no-token surface exactly as today — this recommendation is about the logged-in experience, not the pre-auth one.

---

## 7. Permissions Architecture

A layered model, additive to what exists rather than a replacement of the enforcement mechanism:

1. **Role permissions** — unchanged mechanism (`ROLE_PERMISSIONS` dict, `require_permission(...)`), only the input cardinality changes: union over every active `PersonRole`, not a single `user.role` lookup.
2. **Relationship permissions** — capability flags on `PersonRelationship` (§3.3), checked at the service layer for any action targeting a *different* `Person`'s records, generalizing the existing `participant_identity.py` ownership-check pattern.
3. **Event-specific permissions** — genuinely net new; today's model has no scoping concept at all (global admin, or nothing). A `PersonRole` row with a nullable `scope`/`event_id` (e.g., "session lead for Event X") supports this without inventing a second permission system.
4. **Administrative permissions** — unchanged; `admin.access`/`*.manage` become one more role among a `Person`'s set rather than a mutually exclusive alternative to `participant`.

Recommend keeping `require_permission(...)`/`require_admin` exactly as implemented — simple, proven, well understood — and changing only what feeds "what permission strings does this caller have."

---

## 8. Migration Strategy

**Reusable as-is:** the JWT/OAuth2 login mechanism, the `require_permission`/`require_admin` dependency shape, `UserActionToken`'s hashed/single-use/expiring/purpose-discriminated pattern (a strong candidate to extend again for any new token need this model introduces), the `AdminAuditEvent` audit pattern, and the entire "self-register now, formally link later" mental model already proven by hybrid accounts + claiming — it generalizes almost directly to "create a `Person` for a household member at registration time, let them claim their own login later," the same shape one level up.

**Needs restructuring:** `User.role` (single string) → `PersonRole` (join table); `Participant.user_id`/eventual `VolunteerProfile` ownership → `person_id` throughout.

**Suggested slices, each additive and independently low-risk — no FK retargeting or field removal until the prior slice is proven:**

- **Slice 1 — `Person`, additive only.** Add `Person`; backfill exactly one `Person` per existing `User` (1:1, zero behavior change — every existing account gets a `Person` with the one role it already had). Add nullable `person_id` alongside (not replacing) `Participant.user_id`. Nothing changes downstream yet; this slice only proves the new table against real data.
- **Slice 2 — `PersonRole`.** Backfill one `PersonRole` row per existing `User.role`. Change `has_permission()` to read from the union of active `PersonRole` grants, with `User.role` left in place, unread but present, as a fallback until every call site is confirmed migrated — do not drop it in the same slice.
- **Slice 3 — `PersonRelationship`/`Household`.** Purely net new; no backfill exists to do, since no equivalent concept exists today.
- **Only after Slices 1–2 are verified working end-to-end** should `Participant.user_id`/`User.role` actually be retired, with the same guarded (`has_table`/`has_column`), tested-against-a-fresh-database discipline this project already mandates for every schema change — this exact class of change (retargeting a live, frequently-read FK) is what caused both of this project's real production incidents in the past month (`KNOWN_TECHNICAL_DEBT.md`'s two 2026-07-19 postmortems).

**Backward compatibility concerns:** every current reader of `Participant.user_id` — `participant_identity.py`, `GET /api/participants/mine`, `participant_claiming.py` — needs to move to `person_id` in lockstep, not left silently stale (the same category of concern already raised for `participant.waiver_verified` in the Phase 3 review). Any code checking `current_user.role == "admin"` directly, outside `authorization.py`'s central map, needs an explicit audit before Slice 2 — not assumed not to exist.

---

## 9. Future Readiness

| Future need | How this architecture supports it |
|---|---|
| Digital Documents | `Person` becomes `DocumentInstance`'s real owner; `PersonRelationship` capability flags replace the three-parallel-nullable-owner-FK idea tentatively floated in the Phase 3 review — a strictly better fit, confirming that review's pause was the right call. |
| Volunteer Portal | `VolunteerProfile` gains `person_id`, closing the long-flagged two-parallel-volunteer-concepts debt for free, since both volunteer representations can now key off one `Person`. |
| Parent/Guardian Portal | `PersonRelationship` + `Household` are exactly this feature — a guardian's "my household" view is a query over relationships where they're the `related_person_id`. |
| Sponsor Experience | `Household` already generalizes past "family" (it's a named grouping, not a family-specific table); `relationship_type` is an open value, not a fixed family-only enum, so sponsor/organizational relationship types fit with no schema change. |
| Mobile App | Structurally unaffected — same JWT/API surface; benefits from §6's portal unification, since a mobile client talking to one coherent role-driven API is simpler than one that must understand two disjoint portal concepts. |
| Family Registration | A single registration submission can create multiple `Participant` rows (one per child) all linked via `PersonRelationship` to the registering guardian's `Person` in one transaction — today's flow supports exactly one `Participant` per submission, linked only by an incidental email match. |
| Multi-event history | Already partially working today (`GET /api/participants/mine` via `Participant.user_id`); becomes fully general once keyed on `Person`, spanning every role — a person's volunteer assignments, participant registrations, and documents in one place. |
| Additional user roles | `PersonRole` + a `Role` lookup table means a new role ("case worker," "board member") is a data row, not a code change — directly addressing the "future roles" requirement. |

---

## 10. Risks and Tradeoffs

- **Blast radius**: `users.id` is referenced from many existing tables (waiver verifier, audit actor, feedback submitter, notification read-state, volunteer profile audit fields). Introducing `Person` and eventually retargeting ownership is a wide, multi-slice migration that must be sequenced exactly as in §8 — not attempted as one change — consistent with this project's "smallest practical vertical slice" rule.
- **Complexity vs. YAGNI**: a fully general Person/Role/Relationship/Household model risks over-building for an organization that today has exactly two roles and zero guardian concept. Recommend building the *schema* to be shaped for the future (typed relationship rows, a role lookup table) without building every relationship type's UI/behavior up front — add relationship types and roles as data, driven by actual near-term need (parent/guardian first, since it's the Digital Documents blocker), not the full example list enumerated in this request on day one.
- **Security surface**: relationship-based permission checks are a materially larger authorization surface than today's single `user_id == current_user.id` equality check, and need real test coverage — an area this codebase has already flagged as thin — before any relationship-based access reaches production, especially around timely revocation (a revoked relationship must immediately stop granting access, the same correctness bar the waiver token system already meets well for expiry).
- **Legal/consent verification**: guardianship/foster/legal-guardian relationships may eventually need actual verification (a court order, a case worker's confirmation) rather than a self-asserted `relationship_type`. Recommend the `verified_at`/`verified_by_user_id` fields exist from the start (so the platform isn't blocked later) without building a verification workflow prematurely — nothing today requires one.
- **Portal strategy is a judgment call, not a universal answer**: the hybrid recommendation in §6.4 is explicitly chosen for this project's specific risk profile (thin test coverage, no CI, safety-critical liability data) — a different team or a team with stronger test/CI discipline might reasonably choose full unification (Option B) sooner.

---

## 11. Final Recommendation

Adopt `Person` as the durable identity anchor, existing alongside (not replacing) `User` as its credential layer; `PersonRole` to let one person hold multiple simultaneous roles; and `Household` + typed, capability-flagged `PersonRelationship` rows to represent every real-world caregiving/guardian/organizational arrangement this request enumerates — without hardcoding a family-only shape. Recommend the 3-slice migration in §8 (Person backfill → PersonRole → PersonRelationship/Household), each step additive and independently verifiable, before any existing field is retargeted or retired. Recommend the hybrid portal strategy in §6.4 (isolated admin shell, unified everything-else) as the pragmatic fit for this project's current scale and risk tolerance, not a universal prescription.

This directly and specifically unblocks Phase 3: `DocumentInstance`'s owner becomes `person_id`, and a guardian's or caregiver's access to a participant's or volunteer's documents becomes a `PersonRelationship` capability check — replacing, and improving on, the tentative three-parallel-owner-FK idea that review had flagged as unresolved.

This review is complete. Awaiting approval before any implementation planning proceeds.
