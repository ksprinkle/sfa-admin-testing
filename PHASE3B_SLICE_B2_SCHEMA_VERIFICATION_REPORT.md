# Phase 3B — Slice B2: Schema Verification Report

## Status
Phase: 3B, Slice B2
Mode: Implementation — Schema Only
Repository Changes: 2 model files edited (new column + relationship each), 1 new Alembic migration. No reads, writes, authorization, or API responses changed anywhere; no ownership resolution changed; `user_id` remains the sole authoritative link throughout.

This is the permanent deployment record for Slice B2, matching the same verification standard established for B1.

---

## 1. What shipped

| File | Change |
|---|---|
| `api/models/participants.py` | New `person_id` column (nullable, FK → `people.id`) and `person = relationship("Person")`, added directly beside the existing `user_id`/`user` fields. |
| `api/models/volunteer_profiles.py` | Same addition — `person_id` column and `person` relationship. |
| `alembic/versions/a7d3f9c2e5b8_add_person_id_to_participants_and_volunteer_profiles.py` | New guarded migration. `down_revision = f3a8d1c6b9e2` (B1). |

No router, service, schema, or frontend file was touched. No existing column, constraint, or index on either table was altered.

---

## 2. Scope discipline confirmed

Per the roadmap and this slice's explicit constraints:

- **Ownership resolution unchanged** — every existing call site (`participant_identity.py`, `public_registration.py`, `participant_claiming.py`, `admin_participants.py`) still reads and writes `Participant.user_id` exclusively. Confirmed by direct grep: **the only files in `api/` referencing `person_id` at all are the two model files themselves** — zero routers, services, or schemas reference it.
- **Authentication, authorization, API responses, frontend behavior**: unchanged — no file in any of those categories was touched.
- **Legacy references**: `user_id` writes are untouched and continue exactly as before on both tables.
- **Capability evaluation**: not started — `capability_resolution.py` (B5) doesn't exist yet, nothing was added in its direction.

---

## 3. New schema added successfully

Verified end-to-end on a fresh, disposable SQLite database:

```
alembic upgrade head   (empty DB, full history through B2)   →  clean, no errors
```

And separately, against a database seeded to simulate realistic pre-existing production data (3 users, 1 event, 4 participants — 2 linked via `user_id`, 2 not — 2 volunteer profiles), built up through B1 first, then B2 applied on top: clean, no errors.

## 4. Existing foreign keys remain authoritative

`Participant.user_id → users.id` and `VolunteerProfile.created_by_user_id`/`updated_by_user_id → users.id` are unchanged — confirmed via `PRAGMA foreign_key_list` before and after, identical apart from the one new addition. `person_id` is a new, independent, non-authoritative correlation column; nothing was repointed.

## 5. `person_id` populated where the roadmap specifies

| Case | Expected | Confirmed |
|---|---|---|
| `Participant` row with a linked `user_id` | `person_id` set to the correlated `Person` (matched via `people.user_id`) | ✅ — 2 seeded participants (Alice, Carol) backfilled correctly, verified by joining back to `people` and confirming matching emails |
| `Participant` row with `user_id IS NULL` (admin-created / anonymous) | `person_id` stays `NULL` | ✅ — 2 seeded participants (Dave, Erin) confirmed `NULL` |
| `VolunteerProfile` row | `person_id` stays `NULL` for every row (no existing correlation to backfill from, per the roadmap) | ✅ — both seeded rows confirmed `NULL` |

## 6. No production behavior changes

Confirmed by grep (§2) and by the fact that no file outside the two models and the migration itself was touched. `python -m unittest discover tests`: **104 tests, 4 errors — identical to the pre-existing, already-documented `execution_observability` import gap. Zero new failures.**

## 7. Existing tests maintain the current baseline

Same 104/4 result as B1's baseline run — no change in pass/fail composition.

## 8. Migration verified on clean and populated databases

- **Clean**: fresh empty SQLite DB, `alembic upgrade head` through B2 — clean.
- **Populated**: seeded a realistic pre-existing dataset (users, an event, linked and unlinked participants, volunteer profiles) before applying B1 then B2 — backfill produced exactly the expected result (§5).
- **Idempotency, tested directly**: re-invoked the migration's `upgrade()` a second time against the already-migrated, populated database — identical result, no duplicate writes, no errors.
- **Partial catch-up, tested directly**: added a new `Participant` row for a user who already had a `Person` (but no prior participant row), then replayed `upgrade()` — exactly that one new row was backfilled correctly; all other rows were untouched. This is the same class of scenario tested for B1 and, per your standing instruction, now the baseline expectation for every future migration in this rollout.
- **Downgrade verified**: `alembic downgrade -1` dropped both columns (and their indexes/FKs) cleanly; all row counts and remaining data confirmed unaffected afterward.

## 9. Production deployment (2026-07-20)

Committed (`c9ac9c6`), tagged `v1.34.0-phase3b-b2-schema-foundation`, pushed to `origin/master`. Render deploy log confirmed:

```
==> Starting pre-deploy: alembic upgrade head
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Running upgrade f3a8d1c6b9e2 -> a7d3f9c2e5b8, add person_id to participants and volunteer_profiles (identity foundation slice B2)
✅ Database: PostgreSQL (production)
==> Pre-deploy complete!
==> Deploying...
   Database schema revision: a7d3f9c2e5b8
   Application migration head: a7d3f9c2e5b8
   Schema status: MATCH
==> Your service is live 🎉
```

Exactly one migration applied, against real production PostgreSQL, boot diagnostic confirms `MATCH`. Service came up clean with no startup errors.

## 10. Smoke tests show no regressions

- Full test suite: 104/104 non-pre-existing-failure tests pass (§6/§7).
- Direct grep confirms zero application code (routers/services/schemas/frontend) references the new column.
- Existing foreign keys, indexes, and row counts on both tables confirmed unchanged before/after in every test run above.

---

## 11. Conclusion

B2 meets every success criterion set for this slice: the two `person_id` columns exist, are correctly populated exactly where the roadmap specifies (and nowhere else), existing foreign keys and ownership resolution are completely untouched, no production behavior changed, and the migration is verified idempotent under direct replay — including the partial-catch-up case — on both a clean and a realistically populated database. `user_id` remains the sole source of truth on both tables, exactly as instructed; nothing in this slice reads the new column. **Deployed to production 2026-07-20, confirmed live** (§9) — schema status `MATCH`, no startup errors. B2 is complete. Ready for B3.
