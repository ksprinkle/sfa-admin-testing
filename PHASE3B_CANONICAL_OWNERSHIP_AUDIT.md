# Canonical Ownership Audit (Phase 3B, Slice B0.5)

## Status
Phase: 3B, Slice B0.5
Mode: Planning Only — Practical Inventory, Not Architecture
Implementation: Not Authorized
Repository Changes: None

## Purpose

One question: **"What currently belongs to a Person?"** This document is the single source of truth for current vs. future ownership of every entity the Identity Foundation touches, produced before any Phase 3B schema work begins (per [`PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md`](PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md)'s slice B0.5). It exists to be checked against, not re-derived — any new feature's ownership decision should be evaluated against this table first, and this table should be updated (not duplicated elsewhere) as slices land.

Every current-state fact below was confirmed by reading the corresponding model file directly in this session, not inferred — noted per row.

## Ownership Matrix

| Entity | Current Owner | Future Owner | Migration Required |
|---|---|---|---|
| Event Registration | `Participant` row itself; optionally linked to `User` via nullable `Participant.user_id` | `Person`, via `Participant.person_id` | **Yes** — Slice B2 (schema) / B7 (behavior) |
| Waiver | `ParticipantWaiver`, 1:1 with `Participant`, no identity FK of its own | `Person`, inherited through the participant's `person_id` | **Yes** — rides on Registration's migration; consumed by Phase 3C |
| Feedback | `Feedback.submitted_by_user_id` (nullable, → `User`) | `Person` | **Yes** — confirmed directly in the model; a straightforward retarget |
| Communication (message) | `CommunicationMessage.created_by_user_id` (→ `User`) — the **admin who authored it** | Stays on `User` | **No** (see note) |
| Communication (delivery) | `CommunicationDelivery.recipient` — a **raw string** (email/phone), **not a foreign key to any identity table** | `Person` | **Yes — and this is new modeling, not a rename** (see note) |
| Notification read state | `NotificationReadState.user_id` (→ `User`) | `Person` | **Yes** — confirmed directly in the model; straightforward retarget |
| Admin audit event (actor) | `AdminAuditEvent.actor_user_id` (→ `User`) | Stays on `User` | **No** (recommended — see note) |
| Volunteer assignment | `VolunteerProfile`/`VolunteerAssignment` — **no identity FK of any kind**, not even to `User` (only `created_by_user_id`/`updated_by_user_id` audit metadata) | `Person` | **Future** — blocked on a Volunteer identity slice (per 3A §1.7/§9) |
| Sponsor | No model exists today | `Person` | **Future** — net new, no current owner to migrate from |
| Emergency contact | No model exists today (confirmed: no free-text fields on `Participant` to migrate off of) | `PersonRelationship` (`relationship_type="emergency_contact"`) | **Future** — net new, not a migration |
| Household management | No model exists today | `Person`, via a `PersonRelationship` capability check | **Future** — net new |

## Notes

- **Subject ownership vs. actor attribution.** Two different questions are easy to conflate under one "owner" label: *whose record is this* (subject ownership — the thing this audit is about) versus *who performed/authored this action* (actor attribution — a credential-level fact, not an identity-level one). `CommunicationMessage.created_by_user_id` and `AdminAuditEvent.actor_user_id` are both actor attribution, not subject ownership — they answer "which login session did this," which is exactly what `User` is for, not something Phase 3B needs to migrate. The Person migration is about the first category only.
- **The one real surprise in this audit:** `CommunicationDelivery.recipient` is a plain string today, not a foreign key to `Participant` or `User` at all. Migrating message delivery to be `Person`-owned is genuinely new modeling work, not a column rename — worth knowing before anyone assumes it's a small lift.
- **Volunteer assignment has no identity link whatsoever today** — not a wrong owner, an absent one. This is the same gap already flagged in the Phase 3A review (§1.7, "two parallel volunteer concepts") and confirms it's a prerequisite, not something Phase 3B's core slices unblock on their own.

## Project-Wide Constraint (adopted alongside this audit)

No feature implemented during Phase 3B, or after, may introduce a new **subject-ownership** relationship unless the owner is explicitly a `Person` (via `person_id`), or is explicitly and deliberately identified as legacy-for-backward-compatibility (e.g., `Participant.user_id` during the B1–B9 transition, per the roadmap). Concretely, this rules out patterns like `Volunteer.user_id`, `Sponsor.user_id`, or `Parent.user_id` — a new, parallel, role-specific identity link — even where it looks like the fastest way to unblock a specific feature. Every new ownership decision must be checked against this document and the Identity Foundation first, before a new FK is added anywhere.

This constraint applies only to subject-ownership fields, per the distinction above — actor/attribution fields (who performed an action, who authored a message) may continue to reference `User` directly; that is a different, still-valid concern.

This document should be revised in place as ownership actually migrates slice-by-slice (a "Migration Required" cell flips to "Done" as its slice lands) rather than superseded by a new file — it is meant to stay the one place this is checked.
