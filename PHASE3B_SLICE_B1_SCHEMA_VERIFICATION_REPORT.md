# Phase 3B — Slice B1: Schema Verification Report

## Status
Phase: 3B, Slice B1
Mode: Implementation — Schema Only
Repository Changes: 2 new model files, 2 new import lines in `api/main.py`, 1 new Alembic migration. No reads, writes, authorization, or API responses changed anywhere.

This is the permanent deployment record for Slice B1, per the user's request. All verification below was performed locally against a disposable database built by replaying this project's full migration history — not against the live Render Postgres instance, which this session has no access to. Production application of this migration is a separate, not-yet-taken step (see §6).

---

## 1. What shipped

| File | Change |
|---|---|
| `api/models/person.py` | New. `Person` model — `people` table. |
| `api/models/role.py` | New. `Role` model — `roles` table. |
| `api/main.py` | Two new import lines (`api.models.person`, `api.models.role`) so `Base.metadata`/`create_all()`'s local-dev safety net knows about the new tables — matches the existing per-model import convention already used for every other model. |
| `alembic/versions/f3a8d1c6b9e2_add_person_and_role_tables.py` | New guarded migration. `down_revision = e8b4a2f6c1d9` (prior head). |

No router, service, schema, or frontend file was touched. No existing file's behavior changed.

---

## 2. Migration applied successfully

Verified by replaying this project's entire migration history from empty through the prior head (`e8b4a2f6c1d9`) on a fresh, disposable SQLite database, then applying `f3a8d1c6b9e2` on top:

```
alembic upgrade e8b4a2f6c1d9   →  all 30+ prior migrations applied cleanly, no errors
alembic upgrade head           →  f3a8d1c6b9e2 applied cleanly, no errors
alembic current                →  f3a8d1c6b9e2 (head)
```

## 3. Existing row counts unaffected

Seeded 5 representative `users` rows before applying B1, confirmed unaffected after:

| Check | Before B1 | After B1 |
|---|---|---|
| `users` row count | 5 | 5 (unchanged) |
| `users` column list | `id, email, hashed_password, role, is_active, email_verified_at` | identical — confirmed via `PRAGMA table_info(users)`, no new/dropped columns |

No pre-existing table's schema or row count was altered by this migration.

## 4. Nullability / defaults verified

| Table.Column | Nullable | Default | Confirmed |
|---|---|---|---|
| `people.id` | No (PK) | — | ✅ |
| `people.user_id` | Yes | — | ✅ |
| `people.email` | No | — | ✅ |
| `people.created_at` | No | `CURRENT_TIMESTAMP` | ✅ (via `PRAGMA table_info`) |
| `people.updated_at` | No | `CURRENT_TIMESTAMP` | ✅ |
| `roles.id` | No (PK) | — | ✅ |
| `roles.code` | No | — | ✅ |
| `roles.display_name` | No | — | ✅ |
| `roles.created_at` / `updated_at` | No | `CURRENT_TIMESTAMP` | ✅ |

## 5. Foreign keys validated

`PRAGMA foreign_key_list(people)` confirmed exactly one FK: `people.user_id → users.id`, `ON DELETE SET NULL` — matches the model definition and the roadmap's specification (a nullable backfill-correlation link, not yet the authoritative identity FK direction). No FK exists on `roles` (none needed yet). No existing table gained a new foreign key.

## 6. Indexes created successfully

| Index | Table | Type | Confirmed |
|---|---|---|---|
| `sqlite_autoindex_people_1` (PK) | `people` | unique | ✅ |
| `sqlite_autoindex_people_2` (from `uq_people_user_id`) | `people` | unique | ✅ |
| `ix_people_email` | `people` | non-unique | ✅ |
| `sqlite_autoindex_roles_1` (PK) | `roles` | unique | ✅ |
| `sqlite_autoindex_roles_2` (from `uq_roles_code`) | `roles` | unique | ✅ |
| `ix_roles_code` | `roles` | unique | ✅ |

## 7. Backfill correctness

- 5 seeded `users` → exactly 5 `people` rows, each correctly correlated (`people.user_id → users.id`) and with `email` copied faithfully — verified by joining `people` to `users` and confirming every email pair matched.
- Exactly 2 `roles` rows seeded (`participant`/`Participant`, `admin`/`Admin`), matching `ROLE_PARTICIPANT`/`ROLE_ADMIN` in `api/services/authorization.py` exactly.
- **Idempotency, tested directly** (not just assumed from code review): re-invoked the migration's `upgrade()` function a second time against the already-fully-migrated database — row counts stayed at exactly 5 `people` / 2 `roles`, no duplicates, no errors.
- **Partial-catch-up scenario, tested directly**: added a 6th `users` row after the first migration run, then re-invoked `upgrade()` again — exactly one new `people` row was created for the new user, correctly linked; the original 5 were untouched. This is the specific replay pattern behind this project's own documented incident (`KNOWN_TECHNICAL_DEBT.md`'s Alembic-stamp postmortem), so it was worth confirming directly rather than by inspection alone.
- **Downgrade verified**: `alembic downgrade -1` dropped both tables (and their indexes) cleanly; `users` and its row count were confirmed unaffected afterward.

## 8. No existing queries changed

Confirmed by direct grep across `api/`: the only references to the new `Person`/`Role` models anywhere in the codebase are the two import lines in `api/main.py` added for table registration. No router, service, or schema file reads or writes either table.

## 9. No application behavior changed

- `python -m unittest discover tests`: **104 tests run, 4 errors** — all 4 are the pre-existing `ModuleNotFoundError: No module named 'api.services.execution_observability'` failures already documented in `KNOWN_TECHNICAL_DEBT.md` (unrelated to this slice; that module has no `.py` source in the working tree). **Zero new failures.**
- Startup diagnostics (`api/main.py`'s existing schema-status logging) correctly identified the new migration as the application's head once added, and correctly flagged the (unmigrated) local dev database as out of date — confirming the existing drift-detection guardrail sees this migration properly.

---

## 10. What was deliberately not done

- **Not deployed to production.** This report validates the migration against a faithful local reproduction of the full migration history, not against the live Render Postgres database, which this session has no access to. Applying it to production is a separate step requiring its own deploy — not taken here, pending explicit direction.
- **No commit made.** All changes are in the working tree only, per standing instruction to commit only when asked.
- **No `PersonRole`, no `person_id` columns on `Participant`/`VolunteerProfile`, no reads of either new table anywhere** — those are B2 and later, not this slice.

---

## 11. Conclusion

B1 meets every success criterion from `PHASE3B_IDENTITY_FOUNDATION_IMPLEMENTATION_ROADMAP.md` §5: the tables exist, backfill is confirmed exactly 1:1 (plus verified idempotent under direct replay), no production behavior changed, no API changed, and existing tests pass unchanged. Per this slice's own stated bar: if deployed, nothing observable to a user or another engineer reading logs/responses would differ from before — the only new artifact is two populated-but-unread tables. Ready for B2, pending approval.
