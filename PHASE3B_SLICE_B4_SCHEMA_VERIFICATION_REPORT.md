# Phase 3B — Slice B4: Schema Verification Report

## Status
Phase: 3B, Slice B4
Mode: Implementation — Schema Only, Fully Inert
Repository Changes: 2 new model files, 2 new import lines in `api/main.py`, 1 new Alembic migration. No reads, writes, authorization, capability evaluation, ownership resolution, participant lookup, API responses, or frontend behavior changed anywhere.

## B4 Mission (restated, verbatim from authorization)

> Introduce the relationship graph without changing application behavior. B4 should create the data structures that will eventually support households and person-to-person relationships, but nothing in the running application should consult them yet.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/models/household.py` | New. `Household` model — `households` table (`id`, `name`, timestamps). |
| `api/models/person_relationship.py` | New. `PersonRelationship` model — `person_relationships` table (`subject_person_id`, `related_person_id`, `relationship_type`, five independent capability flags, `household_id`, `status`, `verified_at`/`verified_by_user_id`, timestamps). |
| `api/main.py` | Two new import lines for table registration — same convention as every prior slice. |
| `alembic/versions/c8f2b6a4d1e9_add_household_and_person_relationship_tables.py` | New guarded migration. `down_revision = b4e6a1d9c3f7` (B3). No backfill, no seed data. |

No router, service, schema, or frontend file was touched.

---

## 2. Design notes carried forward from 3A/3B

- **`relationship_type` is a label, not authority.** The five capability columns (`can_register_for`, `can_view_documents`, `can_manage_documents`, `can_receive_communications`, `is_emergency_contact_only`) are independent boolean fields, not derived from `relationship_type` — matching the explicit distinction from `PHASE3A_UNIFIED_IDENTITY_AND_HOUSEHOLD_ARCHITECTURE_REVIEW.md` §3.1 that two rows of the same type can carry different capabilities. Nothing in this slice computes or defaults these flags from the type string — that's application-layer logic for whichever future slice actually writes rows.
- **`Household` is never an owner.** No FK from any existing owning table (`Participant`, `ParticipantWaiver`, etc.) points at `households` — it only exists as an optional grouping `PersonRelationship` rows can reference via the nullable `household_id`.
- **No uniqueness constraint on `(subject_person_id, related_person_id)`.** Two people can legitimately have more than one relationship row between them (e.g., separately-granted caregiver and emergency-contact capabilities, or a revoked row followed by a newly active one) — left unconstrained deliberately rather than guessing at a cardinality rule with zero real data to validate it against yet.

---

## 3. No backfill, no inference — confirmed deliberate

Per your explicit instruction, no attempt was made to infer relationships from existing participant data (shared last names, shared emails, shared addresses, etc.). This is also consistent with `PHASE3B_CANONICAL_OWNERSHIP_AUDIT.md`'s finding that no emergency-contact or guardian field exists anywhere in the current schema to backfill from in the first place — there was nothing to infer *from*, and no attempt was made regardless. Both tables start, and remain, completely empty after this migration.

---

## 4. Migration verification

- **Fresh database**: `alembic upgrade head` on an empty SQLite DB, full history through B4 — clean, no errors.
- **Populated database**: seeded 2 users before B1 ever ran, replayed the full B1→B2→B3→B4 chain. Result: `households` and `person_relationships` both at `0` rows; `users`/`people`/`roles`/`person_roles` (2/2/2/2) completely unaffected by this migration.
- **Idempotency, tested directly**: re-invoked `upgrade()` a second time against the already-migrated database — both tables stayed at `0` rows, no errors, no duplicate schema objects.
- **Partial catch-up**: not applicable — this slice has no backfill logic to test against new data, per its own scope (§ "must not… backfill inferred relationships").
- **Downgrade verified**: `alembic downgrade -1` dropped both tables and all three indexes cleanly; `users`/`people`/`person_roles` row counts confirmed unaffected afterward.

## 5. Full test suite

`python -m unittest discover tests`: **112 tests, 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures.**

## 6. Isolation verification

Confirmed by direct grep across the entire codebase:

- **No router references either new table** — zero matches for `Household`/`PersonRelationship` anywhere under `api/routers/`.
- **No service references either new table** — zero matches anywhere under `api/services/`.
- **No schema exposes either new table** — zero matches anywhere under `api/schemas/`.
- **No frontend code references either table** — zero matches (case-insensitive) anywhere under `admin-app/src/`.
- **The only two files in the entire codebase that mention `Household` or `PersonRelationship` are their own model definitions** (`api/models/household.py`, `api/models/person_relationship.py`) plus the migration and this report.

No API response shape changed — no endpoint was touched. No authentication or authorization code was touched (confirmed: `api/services/authorization.py` and `api/dependencies.py` are unmodified since B3). No participant lookup or registration ownership logic was touched (`api/services/participant_identity.py`, `api/services/public_registration.py`, `api/services/participant_claiming.py` all unmodified since B2/earlier).

---

## 7. Production deployment (2026-07-20)

**First attempt failed, caught and fixed same day.** Committed (`e305d08`), tagged `v1.36.0-phase3b-b4-relationship-foundation`, pushed. Pre-deploy failed:

```
sqlalchemy.exc.ProgrammingError: (psycopg2.errors.DatatypeMismatch) column "can_register_for" is of type boolean but default expression is of type integer
==> Pre-deploy has failed
==> Exited with status 1
```

**Root cause**: the migration used `server_default=sa.text("0")` for the five capability-flag boolean columns. SQLite tolerates this (booleans are just integers there), so every local test in §4 passed silently — PostgreSQL does not, and rejected it outright. Because Alembic runs each migration inside one transaction for PostgreSQL ("Will assume transactional DDL"), the failed `CREATE TABLE person_relationships` rolled back the entire migration, including the already-issued `CREATE TABLE households` — production was left exactly at the prior (B3) schema revision, confirmed still serving normally throughout (`GET /` returned `200` before, during, and after the failed attempt).

**Fix**: replaced `sa.text("0")` with `sa.false()`, a dialect-portable SQLAlchemy construct — confirmed by directly compiling the `CREATE TABLE` DDL against the real PostgreSQL dialect (no server required) before touching production again: `BOOLEAN DEFAULT false NOT NULL` for PostgreSQL, `BOOLEAN DEFAULT '0'` for SQLite, both dialect-correct. Checked B1–B3 for the same class of bug — none have any boolean column with a literal `server_default`, so this was isolated to B4. Re-ran the full verification suite from §4 against the corrected migration: identical results (clean fresh/populated migration, idempotent replay, clean downgrade, 112/112 non-pre-existing-failure tests).

**Second attempt, successful.** New commit (`ed0f247`), tag moved to point at it (`git tag -f` + force-push, since the original tagged commit never successfully deployed), pushed. Deploy log:

```
==> Starting pre-deploy: alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade b4e6a1d9c3f7 -> c8f2b6a4d1e9, add households and person_relationships tables (identity foundation slice B4)
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: c8f2b6a4d1e9
   Application migration head: c8f2b6a4d1e9
   Schema status: MATCH
==> Your service is live 🎉
```

**Live production validation:**

| Check | Method | Result |
|---|---|---|
| Schema status | Deploy log | `MATCH` |
| Clean startup | Deploy log | No errors, service live |
| Participant login | Fresh throwaway test account via real public register/login flow | `200`, JWT issued |
| Participant route access (`participants.view_own`) | `GET /api/participants/mine` | `200`, `[]` — unchanged from pre-B4 |
| Admin-permission denial for a participant | `GET /api/admin/permissions/matrix` | `403` — unchanged from pre-B4 |
| Public smoke checks | `GET /`, `GET /api/events` | `200` / `200` |
| Admin login + admin-only route access | Confirmed directly | Both pages work fine |

Every check matches pre-B4 behavior exactly — B4 remained as invisible in production as B1 and B2 were, once the boolean-default bug was fixed.

---

## 8. Conclusion

B4's mission — introduce the relationship graph without changing application behavior — held completely, though it took two deploy attempts to get there: a real PostgreSQL/SQLite dialect difference in the boolean column defaults slipped past local-only testing, was caught by production's own pre-deploy guardrail (the migration failed cleanly inside a transaction rather than partially applying), fixed, and re-verified before a successful second deploy. Both tables now exist in production, are correctly wired to `people`/`households`/`users`, contain zero rows, and are referenced nowhere outside their own model definitions. No inference was attempted, no capability evaluation was introduced, and every live and local check matches pre-B4 behavior exactly. With B1–B4 complete, the entire structural identity layer (`Person`, `Role`, `PersonRole`, `Household`, `PersonRelationship`) now exists in production-ready form, fully inert, ready for B5 (`capability_resolution.py`) to be the first thing that actually reads any of it. Compiling migration DDL against the real PostgreSQL dialect before deploying is now a standing step for any future migration with type-sensitive defaults.
