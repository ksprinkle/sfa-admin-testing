# Phase 3 — Digital Documents Platform: Architecture Review

## Status
Phase: 3 Architecture Review
Mode: Planning Only
Implementation: Not Authorized
Repository Changes: None (backend/frontend/migrations untouched by this document)

This document reviews the existing waiver implementation and proposes a target architecture for a generic Digital Documents Platform. It contains no code, no migrations, and no implementation. Per instruction, implementation work is deferred pending approval of this review.

---

## 1. Existing Architecture Inventory

### 1.1 Data model

| Model | File | Purpose | Key fields | Notes |
|---|---|---|---|---|
| `ParticipantWaiver` (alias `Waiver`) | `api/models/participant_waivers.py` | Canonical waiver record, 1:1 with `Participant` | `status` (6-state lifecycle: `draft→sent→viewed→signed→archived/superseded`, plus legacy aliases `pending`/`verified`), `source`, `waiver_version`, `current_revision`, `version_metadata` (JSON provenance snapshot), per-stage timestamps (`sent_at`/`viewed_at`/`signed_at`/`archived_at`/`superseded_at`), `verified_at`/`verified_by_user_id`/`notes` | Cascade-deletes with `Participant`. Fans out to 4 child tables below. |
| `WaiverAuditEvent` | `api/models/waiver_audit_events.py` | Append-only, waiver-domain-only audit trail | `waiver_id`, `event_type`, `from_status`/`to_status`, `actor_user_id`, `source`, `details` (JSON) | One row per lifecycle transition or notable action (token created/viewed/expired, sign submitted/completed, delivery sent/failed, PDF generated/verified, etc.). |
| `WaiverSigningToken` | `api/models/waiver_signing_tokens.py` | Single-use, expiring, hashed access token for public signing | `token_hash` (sha256, unique), `status` (`active`/`completed`/`expired`/`invalidated`), `expires_at`, `first_viewed_at`/`used_at`/`signed_at`/`invalidated_at`, `created_by_user_id`, `token_metadata` | Raw token is never persisted, only its hash — same pattern later reused for `UserActionToken`. |
| `WaiverDelivery` | `api/models/waiver_deliveries.py` | One row per delivery attempt (email/SMS) | `method`, `status` (`created`/`sent`/`failed`/`completed`), `attempt_number`, `resend_of_delivery_id` (self-FK, resend chain), `rendered_subject`/`rendered_body`, `signing_path`, `token_expires_at`, `provider_message_id`, `error_message` | See §1.9 — delivery is simulated, not real, today. |
| `WaiverTemplate` | `api/models/waiver_templates.py` | Versioned waiver text | `title`, `version` (int, **globally** unique — not scoped per document type), `status` (`draft`/`active`/`archived`), `content` (Text), `supersedes_template_id` (self-FK) | Single-active-template invariant enforced in the service layer, not the schema. |
| `WaiverPdfArtifact` | `api/models/waiver_pdf_artifacts.py` | Immutable signed-PDF archive record | `waiver_revision`, `waiver_template_id`, `template_version`, `template_content_sha256`, `storage_path` (unique), `sha256_hash`, `byte_size`, `is_immutable` | Unique on `(waiver_id, waiver_revision)`. File lives on local disk, not object storage. |

Additionally, `Participant` itself (`api/models/participants.py`) carries three **denormalized** waiver fields: `waiver_signed`, `waiver_verified` (booleans), `waiver_signed_at`. These duplicate `ParticipantWaiver.status` and are reconciled ad hoc by `waiver_lifecycle.py::derive_participant_waiver_status()`. This dual source of truth is a real, current condition — not hypothetical — and is the single most important pattern *not* to carry forward into a multi-document-type platform (see §5.1).

Migrations: `alembic/versions/{q4f7c2b9a8d1,r8a1f6d3c5b2,t1c9e3a7b2d4,u4a7d2c9e1f5,v5d2a1c8f4e7,w6f3b2d8a9c1,x2d4b8c9f1a3}_*.py` — one per table/column addition, spread across the waiver system's build-out. These were among the 18 migrations caught in the 2026-07-19 incomplete-Alembic-stamp postmortem (`KNOWN_TECHNICAL_DEBT.md`) and were confirmed already guarded (`has_table`/`has_column`) when audited.

### 1.2 Routers

`api/routers/waivers.py` (prefix `/waivers`) — all `require_admin`-gated except two:

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /reports/metrics`, `/reports/analytics-events`, `/reports/deliveries/export.csv` | admin | Dashboard/CSV reporting, reads via `waiver_reporting.py` |
| `POST/GET /{waiver_id}/deliveries[...]` | admin | Create/resend/list/get delivery attempts |
| `POST /{waiver_id}/pdf/generate`, `GET /{waiver_id}/pdf`, `/pdf/download`, `/pdf/verify` | admin | PDF artifact lifecycle |
| `POST /create-token` | admin | Admin manually issues a signing token for a participant |
| `GET /sign/{token}` | **none** | Public — validates token, returns template text to render |
| `POST /sign/{token}` | **none** | Public — records signature; gated only by possessing the raw token |

`api/routers/admin_waiver_templates.py` (prefix `/admin/waiver-templates`) — full CRUD + `/activate` + `/archive`, all `require_admin`.

**Important existing gap:** waiver state is also mutated from *outside* this router pair. `api/routers/admin_participants.py`'s `POST /{participant_id}/action` (`action=verify_waiver`) and its general `PATCH` participant-update path call locally-defined helpers (`_upsert_verified_waiver`, `_clear_verified_waiver`) that write directly to `ParticipantWaiver`/`Participant`, duplicating logic that conceptually belongs behind the dedicated waiver service API. There are effectively **two independent entry points** into the same lifecycle state machine.

### 1.3 Schemas

`api/schemas/waivers.py` and `api/schemas/waiver_templates.py` — standard Pydantic request/response models per endpoint above (token creation, delivery create/resend, PDF artifact/verification output, public sign in/out, template CRUD/activate/preview). No schema-level surprises; shapes mirror the ORM models directly.

### 1.4 Service layer

| Service | Responsibility | Reuse assessment |
|---|---|---|
| `waiver_lifecycle.py` | Canonical 6-state FSM (`_STATUS_TRANSITIONS` map), status canonicalization (handles legacy aliases), `transition_waiver_status()` (validates transition, stamps stage timestamp, writes audit event), `record_waiver_audit_event()` (audit write without a transition), `derive_participant_waiver_status()` (dual-source-of-truth reconciliation) | **Reuse near-verbatim** — well-designed, guarded, audited. Only the dual-source reconciliation function is waiver/Participant-specific and should not be replicated per document type. |
| `waiver_signing.py` | Token generation (`secrets.token_urlsafe(32)`, sha256-hashed at rest), `create_signing_token()` (invalidates prior active tokens, blocks if already verified, transitions to `SENT`), `validate_token_for_access()` (completed/invalidated/expired/active branches, each audited), `mark_token_viewed()`, `complete_public_signing()` (idempotent — early-returns if already signed) | **Reuse the pattern**, but note `UserActionToken` (built later, for email verification) already generalizes this exact mechanism with a `purpose` column — see §2. |
| `waiver_template_lifecycle.py` | Template CRUD, `activate_template()` (auto-archives the prior active template, enforces single-active-per-\[scope\] invariant), `archive_template()` (blocks archiving the currently-active template directly) | **Reuse near-verbatim** — only needs a `document_type_id` dimension added to the single-active invariant. |
| `waiver_template_provenance.py` | `TemplateSnapshot` dataclass, `hash_template_content()`, `resolve_template_snapshot_for_waiver()` (3-tier fallback: recorded metadata → version match → activated/archived time-window match against `signed_at`) | **Reuse near-verbatim** (rename only) — this is exactly the kind of "what did the signer actually see" provenance a compliance-sensitive platform needs regardless of document type. |
| `waiver_pdf_archive.py` | Renders a PDF via `reportlab` (plain-text field dump, not the actual template content), sha256-hashes it, writes to local disk (`api/storage/waiver_pdfs/artifacts/{year}/{uuid}/artifact.pdf`, exclusive-create), 3-way `verify_artifact_for_waiver()` (storage/integrity/provenance → `VALID`/`INVALID`) | **Reuse the storage/integrity/verification mechanics**; the PDF-rendering step itself must become pluggable per document type (a media release or code-of-conduct won't render the same fields a liability waiver does). |
| `waiver_delivery.py` | Builds delivery context, renders subject/body from a format-string template, calls `_simulate_provider_send()` | **Do not reuse as-is** — see §1.9, this is a stub, not a real send path. |
| `waiver_reporting.py` | Dashboard metrics, analytics events, CSV export — read-only aggregation | Reuse pattern; generalize per document type. |

### 1.5 Auth dependencies

Everything above is gated by `require_admin` (`api/dependencies.py`) except the two public `/sign/{token}` endpoints, which are intentionally unauthenticated — access control is the possession of a valid hashed token, not a JWT. Auto-issuance from public registration (`public_onboarding.py`) likewise needs no auth, since it runs inside an already-anonymous registration flow.

One participant permission, **`waivers.view_own`**, is defined and granted in `api/services/authorization.py` but has **zero consuming endpoints** — confirmed by inspecting `api/routers/participant_self.py` and `api/services/participant_identity.py`: `GET /api/participants/mine` exposes only a derived `waiver_status` string under the pre-existing `participants.view_own` permission, never `waivers.view_own`. This is the same "defined ahead of being wired up" pattern already flagged elsewhere in this codebase.

The same pattern exists on the admin side: `PERMISSION_WAIVERS_MANAGE` ("waivers.manage") is defined and granted to the `admin` role, but every admin waiver route uses the coarser `require_admin`/`admin.access` dependency instead — `waivers.manage` is never actually passed to `require_permission()` anywhere in the codebase. Two dead, defined-but-unwired permissions exist in this one feature area alone.

### 1.6 Audit logging integration

Two audit trails exist, and they are **not cross-referenced**:

1. **`WaiverAuditEvent`** — fine-grained, waiver-domain-only (token lifecycle, sign events, delivery events, PDF events, `waiver_verified`/`waiver_reset` for admin overrides). No dedicated viewer UI exists anywhere in the frontend.
2. **`AdminAuditEvent`** — the generic, cross-domain audit log surfaced in `AuditLog.jsx` and the Notification Center. `admin_participants.py` writes to it for `promote`, `assign_session`, `remove`, etc. — but **not** for the `verify_waiver` action (confirmed directly: that branch calls only `_upsert_verified_waiver`, never `record_admin_audit_event`). An admin manually overriding a participant's waiver status today leaves a trail in `WaiverAuditEvent` but is invisible in the general Admin Audit Log and Notification Center, unlike almost every other administrative participant action.

### 1.7 Timeline integration

Two distinct, independent timeline features both surface waiver activity — not one:

- **`api/services/event_operations_timeline.py`** — a per-*event* operations feed. Derives exactly one entry type, `WAIVER_VERIFICATION`, directly from `ParticipantWaiver.verified_at` (not from `WaiverAuditEvent`) — a read-only, additive-by-design projection with no new table. Rendered by `OperationsTimeline.jsx` on `EventDetail.jsx`.
- **`api/services/participant_timeline.py`** — a per-*participant* activity feed (separate service, separate schema `api/schemas/participant_timeline.py`). Has four waiver-specific entry builders: template-assignment (from `waiver.version_metadata`), waiver-signed, PDF-generated (iterates `waiver.pdf_artifacts`), and PDF-verified (filters `waiver.audit_events` for `event_type=="PDF_VERIFIED"`) — this one *does* read `WaiverAuditEvent`, unlike the event-level timeline.

Both are additive-by-design projections with no new tables, and both are worth reusing unchanged in shape. A generic documents platform should decide deliberately whether a document-type-agnostic version of each is warranted, or whether per-participant document history now lives more naturally as a "My Documents" view instead of a timeline entry (see §3.6).

### 1.8 Registration flow integration

`api/services/public_onboarding.py::complete_public_registration()` calls `register_public_participant()` then, only if `waiver_template_lifecycle.get_active_template()` returns a row, auto-issues a signing token (`actor_user_id=None`, marking it system-issued) and returns `signing_path` to the frontend, which redirects into the static `waiver-signing.html` page. **"Waiver required" today literally means "does any `WaiverTemplate` row have `status=active`"** — there is no per-event, per-role, or per-document-type requirement flag anywhere in the data model. Separately, `admin_participants.py`'s check-in action is hard-blocked unless `participant.waiver_verified` is true.

### 1.9 Email integration

`api/services/waiver_delivery.py::_simulate_provider_send()` is a **hardcoded deterministic stub** (`"fail" in recipient.lower()` → failure, else a fake success with a fabricated `provider_message_id`). It does **not** call `api/services/email_delivery.py` — the real, now-hardened SMTP provider abstraction built for account verification (fail-closed production guardrail, circuit-breaker-aware). This means waiver "delivery" today never actually sends an email or SMS; it only simulates one for demo/testing purposes. This is a genuine, currently-live gap, not a hypothetical risk.

### 1.10 Frontend

| Component | Portal | Purpose |
|---|---|---|
| `admin-app/src/pages/WaiverTemplates.jsx` + `admin-app/src/api/waiverTemplates.js` | Admin | Template list/create/edit-draft/preview/activate/archive |
| `admin-app/public/waiver-signing.html` | Public (static, **not** part of the React bundle) | Token-gated signing page; reached from an admin-sent delivery link or automatically from `PortalRegister.jsx`'s redirect |
| Waiver actions embedded in `Participants.jsx` / `ParticipantActionsDropdown.jsx` | Admin | Verify/reset waiver via `POST /participants/{id}/action` |
| `PortalMyRegistrations.jsx` | Participant Portal | Shows only a derived `waiver_status` string — no document detail, no download |

No admin UI exists to browse an individual waiver's audit trail, delivery history (beyond CSV export/metrics), or download a signed PDF through the SPA (the endpoint exists; nothing in the frontend calls it). No participant-facing document library exists at all.

`waiver-signing.html` includes a canvas signature pad (draw, undo/redo, local-storage draft autosave) — but a closer read of its submit handler shows the drawn strokes are **never transmitted to the backend**: the `POST /waivers/sign/{token}` body only carries `{accepted, signer_name, relationship_to_participant, waiver_version}` (`WaiverPublicSignIn`'s actual shape). The signature image is captured and rendered client-side only; what the backend actually records as "the signature" is a typed name string (which the client doesn't even strictly require alongside a drawn signature). This is a concrete, current gap between what the UI implies is being captured and what is legally recorded — worth a decision (either wire the canvas image through as a stored artifact, or remove it so the UI doesn't overstate what's retained) independent of Phase 3, and worth not repeating in a generalized signing page.

### 1.11 The untracked PDF file

`admin-app/public/SFA Liability Waiver.pdf` (untracked, working tree only) has **zero code references** anywhere in `admin-app/src` or `api` — it is not linked from any page, not read by any upload flow, and not the source of `WaiverTemplate.content` (which is plain text/HTML, not a PDF). It appears to be reference source material staged for this initiative rather than a wired-up artifact.

### 1.12 Test coverage

No file matching `test_*waiver*` exists, but `tests/test_public_onboarding.py` does exercise waiver logic indirectly — auto-issuance on registration, the full public sign flow (asserting the exact expected `WaiverAuditEvent` sequence: `TOKEN_CREATED→TOKEN_VALIDATED→TOKEN_VIEWED→TOKEN_VALIDATED→SIGN_SUBMITTED→SIGN_COMPLETED`), waitlisted registrants still receiving a waiver, and the legacy endpoint's no-side-effect guarantee. There is, however, no dedicated coverage for the admin waiver router, PDF archive/verification, delivery/resend, or template lifecycle — consistent with `KNOWN_TECHNICAL_DEBT.md`'s broader statement that most routers (participants, events, waivers) lack automated tests. Any Phase 3 work inherits this partial-coverage gap; it is not new debt introduced by this review.

---

## 2. Reusable Platform Components

Ranked by how directly they generalize:

1. **Token-based signing access** (`WaiverSigningToken` + `waiver_signing.py`) — the codebase has *already* generalized this once: `api/services/account_verification.py` explicitly "mirrors the waiver-signing token pattern... against a new generic `user_action_tokens` table" (`UserActionToken`, hashed/single-use/expiring/invalidate-on-reissue, with a `purpose` discriminator column). This is the strongest reuse signal in the whole review — a generic document-signing token either extends `UserActionToken` again or is modeled identically a third time. Recommend extending `UserActionToken` rather than a third parallel implementation.
2. **Status lifecycle + per-transition audit event** (`transition_waiver_status()` + `WaiverAuditEvent`) — the FSM shape (guarded transitions, stage timestamps, mandatory audit row) is sound and directly generic.
3. **Template versioning with single-active invariant** (`WaiverTemplate` + `waiver_template_lifecycle.py`) — reusable verbatim except the version counter must become scoped per document type instead of global (see §5.1).
4. **Content-hash provenance snapshot** (`waiver_template_provenance.py`) — proves what text a signer actually saw; entirely document-type-agnostic already.
5. **Immutable artifact archive with 3-way verification** (`WaiverPdfArtifact` + `waiver_pdf_archive.py`'s storage/integrity/provenance check) — the model is ~90% generic already; only PDF *rendering* is waiver-specific.
6. **Delivery-attempt tracking with resend chains** (`WaiverDelivery`) — reusable shape, but the send mechanism must be replaced with the real `email_delivery.py`, not the current simulation.
7. **Timeline entry-type extensibility** (`event_operations_timeline.py`) — proven additive pattern, reuse unchanged.
8. **Ownership scoping via `require_permission` + row-level `user_id` check** (`participant_identity.py`) — reusable for any "my documents" surface, contingent on the owning role having an identity linkage at all (see §5.4 — volunteers and guardians do not yet).

---

## 3. Recommended Platform Architecture

### 3.1 Domain model summary

- **`DocumentType`** (net-new, table not enum) — `code`, `display_name`, applicable owner kind(s), whether it requires a signature, etc. Making this a table rather than a hardcoded set is what actually delivers "future document types" without a schema/router change per type.
- **`DocumentTemplate`** (generalized `WaiverTemplate`) — add `document_type_id`; scope the version-uniqueness constraint per `document_type_id` instead of globally; keep the draft/active/archived + `supersedes_template_id` machinery unchanged.
- **`DocumentAssignment`** (net-new — the actual missing piece) — links a `document_type_id` to an owner and optionally an `event_id`, with a required/optional flag. This is what "a media release is required for this volunteer at this event" should be, generalized from today's implicit "any active `WaiverTemplate` means every registrant needs one" rule.
- **`DocumentInstance`** (generalized `ParticipantWaiver`) — one per `(document_type, owner)`; same 6-state lifecycle, same `current_revision`/`version_metadata` shape.
- **`DocumentAuditEvent`**, **`DocumentSigningToken`** (or `UserActionToken` extension), **`DocumentDelivery`**, **`DocumentArtifact`** — generalized 1:1 renames of the existing four child tables, same relationships and constraints.

### 3.2 Ownership model

Recommend **typed nullable FKs** (`owner_participant_id` / `owner_volunteer_id` / `owner_guardian_id`, exactly one non-null, enforced by a check constraint) over a stringly-typed polymorphic `owner_type`/`owner_id` pair. This matches the codebase's existing convention — it does not use polymorphic associations anywhere else, and the one loosely-typed FK that does exist (`ParticipantRemovalLog.event_id` stored as text against a UUID column) is explicitly called out in `KNOWN_TECHNICAL_DEBT.md` as a defect, not a pattern to repeat.

### 3.3 Versioning strategy

Identical lifecycle to today's `WaiverTemplate`, scoped per `document_type_id` rather than globally.

### 3.4 Document / signature lifecycle

Keep the existing 6-state machine and transition table verbatim (`draft→sent→viewed→signed→archived/superseded`) — it is well-designed, guarded, and audited already. The only required change is making it type/owner-generic instead of waiver/participant-specific.

### 3.5 API organization

One generic router pair, parameterized by `document_type_id` (`api/routers/documents.py`, `admin_document_templates.py`), replacing a new router file per document type. The two public sign/view endpoints and the admin template/instance/delivery/PDF endpoints carry over structurally unchanged. Critically: re-point `admin_participants.py`'s embedded `verify_waiver`/checkin-gating logic at the *same* service functions the dedicated router uses, closing the two-entry-point gap identified in §1.2 rather than multiplying it across four document types.

### 3.6 Frontend architecture

- Generalize `WaiverTemplates.jsx` into a `DocumentTemplates.jsx` with a document-type selector.
- Generalize `waiver-signing.html` into one parameterized signing page. Worth an explicit decision (not assumed here): keep it a static page outside the SPA (consistent with today's pattern), or bring it into the React portal tree now that it needs to serve participant, volunteer, and guardian signers rather than one link-token flow.
- Add a real "My Documents" portal page — nothing like this exists today; `PortalMyRegistrations.jsx` shows only a derived string, never the document itself or a download link.

### 3.7 Integration with existing participant accounts

`Participant.user_id` is the existing identity linkage for participants and can back "my documents" for that role immediately. Volunteers and guardians have **no equivalent identity linkage today** (`VolunteerProfile` has no `user_id`; no `Guardian` model exists at all) — this is a prerequisite dependency for two of the four listed document owner kinds, not something the documents platform itself should absorb as in-scope work.

---

## 4. Proposed Data Model

See §3.1–3.2. In summary: 7 tables, structurally a 1:1 generalization of the 6 existing waiver tables plus one net-new table (`DocumentAssignment`) and one net-new registry table (`DocumentType`). No new architectural pattern is introduced — the recommendation is explicitly to reuse the existing shape, not redesign it.

---

## 5. Service Architecture

Reuse `waiver_lifecycle.py`, `waiver_template_provenance.py`, and `waiver_pdf_archive.py`'s storage/verification mechanics near-verbatim under generalized names. Rewrite `waiver_delivery.py`'s send path to call the real `email_delivery.py` provider abstraction rather than `_simulate_provider_send()`. Consolidate the two current entry points into waiver state (dedicated router vs. `admin_participants.py`-embedded helpers) into one service-layer API with a single call site per action.

### 5.1 Key risks specific to service design (see also §8)

- **Dual source of truth**: `Participant.waiver_signed`/`waiver_verified`/`waiver_signed_at` duplicate `ParticipantWaiver.status` today, reconciled ad hoc. This does not scale to N document types — do not add a boolean pair per type to `Participant`. `derive_participant_waiver_status()`-style reconciliation should not be replicated.
- **Global version counter**: `WaiverTemplate.version` is globally unique across all templates, not scoped per lineage. A shared `DocumentTemplate` table needs versions scoped per `document_type_id` or numbering becomes meaningless once multiple types share the table.
- **Implicit requirement flag**: "waiver required" = "an active template exists," a global singleton assumption. `DocumentAssignment` (§3.1) is the fix, and is probably the single highest-value net-new addition in this whole platform.

---

## 6. Frontend Architecture

Covered in §3.6. Principal risk: the temptation to copy `WaiverTemplates.jsx`/`waiver_template_lifecycle.py` per document type (a `MediaReleaseTemplates.jsx`, `CodeOfConductTemplates.jsx`, etc.) instead of parameterizing one component by `document_type_id`. Recommend explicitly against per-type page/model proliferation — it is the direct opposite of the stated goal ("without duplicating implementation across portals").

---

## 7. Migration Strategy

**Reusable as-is (rename only, no shape change):** `WaiverAuditEvent`, `WaiverSigningToken` (or fold into `UserActionToken`), `WaiverDelivery` (once repointed to real email), `WaiverPdfArtifact`, and the entirety of `waiver_lifecycle.py`'s transition machinery.

**Needs real restructuring:** `ParticipantWaiver` → `DocumentInstance` (participant-only FK becomes typed owner FKs + a `document_type_id`) and `WaiverTemplate` → `DocumentTemplate` (add `document_type_id`, change version uniqueness from global to per-type). These are the only two tables where the migration changes semantics, not just names.

**Suggested data migration path:** create a single `document_types` row for the existing waiver (e.g. `code="liability_waiver"`), backfill `participant_waivers` into `document_instances` with `document_type_id` set to that row and `owner_participant_id = participant_id`, **preserving every existing primary key** so the four child tables' foreign keys need only a column rename, not a data rewrite. Follow the project's mandatory guarded-migration pattern (`has_table`/`has_column` checks via `sqlalchemy.inspect()`) throughout — no unguarded migration, per `CLAUDE.md`'s Development Guardrails.

**Backward compatibility concerns:** `participant.waiver_verified` is read directly by check-in gating, `GET /api/participants/mine`'s derived `waiver_status`, and `event_operations_timeline.py`'s `WAIVER_VERIFICATION` entry. All three call sites need to be repointed to the new generic model (or bridged by a compatibility read during a transition window) — none should be left silently reading a field that's stopped being updated.

**Risk context:** this repository had two real production incidents in the last month from migration/stamp mishandling (`KNOWN_TECHNICAL_DEBT.md`'s two 2026-07-19 postmortems). A migration touching `participant_waivers` — a table read on every check-in, not a quiet background table — warrants the same guarded discipline already mandated, plus an actual staging dry-run given the larger blast radius of an FK/ownership-model change versus a typical additive column.

---

## 8. Risks and Tradeoffs

- **Scalability**: not a concern at this org's scale (SQLite dev / Postgres prod, nonprofit event-roster volume).
- **Maintainability**: the two architectural gaps already present in the waiver system in miniature — two entry points into one lifecycle, two non-cross-referenced audit trails — will multiply across four document types and three owner kinds unless the router/service boundary is enforced as the *only* entry point from day one, and a single audit strategy is chosen up front.
- **Duplication risk**: per-document-type table/router/page proliferation is the main risk to actively design against; parameterizing by `document_type_id` throughout is the mitigation.
- **Legal/audit concerns**: the existing audit design (event-per-transition, immutable sha256-hashed PDF, content-hash provenance) is genuinely solid for a liability-sensitive nonprofit and should be preserved intact. Two concrete defects found are worth fixing regardless of Phase 3's timeline, since both touch what's actually retained as legal proof of consent: (1) `verify_waiver` never reaching the general `AdminAuditEvent` log — an admin overriding a legal document's status is exactly the class of action that belongs in the central audit log; (2) `waiver-signing.html`'s canvas signature drawing is captured and displayed client-side but never sent to the backend — the system currently records a typed name as "the signature," not the drawn image the UI presents to the signer (§1.10). Neither should be carried into a generalized platform unexamined.
- **Future extensibility**: a `DocumentType` registry + `DocumentAssignment` requirement model is what actually delivers "future document types" without repeated schema/router/page work; without them, each new type becomes new tables/routers/pages — the opposite of the platform's stated goal.

---

## 9. Final Recommendation

Reuse the existing lifecycle, audit, token, artifact, and provenance mechanics near-verbatim — they are well-designed and already partially generalized elsewhere in the codebase (`UserActionToken`). The genuine net-new work is: (1) a `DocumentType` registry and `DocumentAssignment` requirement model, replacing today's implicit "any active template = required for everyone" rule; (2) generalizing the owner reference from participant-only to typed nullable FKs for participant/volunteer/guardian; (3) closing the two gaps already visible in the waiver system — one router/service entry point, one coherent audit trail, and real (not simulated) delivery — before they're multiplied across document types; and (4) treating Volunteer and Guardian identity as an explicit prerequisite dependency outside this platform's own scope, not folded in as if it were free.

**Suggested sequencing** (for a future implementation phase, not authorized here):
- Slice 1 — generalize `WaiverTemplate`/`ParticipantWaiver` into `DocumentTemplate`/`DocumentInstance` and migrate the existing waiver as the first `document_type` row. No new user-facing surface; proves the generalized model against real data.
- Slice 2 — `DocumentAssignment` + admin UI to configure per-event/per-role document requirements.
- Slice 3 — additional document types (media release, code of conduct) as pure data once Slice 1's genericism is proven, with real email delivery wired in.
- Volunteer/Guardian document support — blocked on their own identity-model slices; not startable until an owning identity exists for those roles.

This review is complete. Awaiting approval before any implementation planning proceeds.
