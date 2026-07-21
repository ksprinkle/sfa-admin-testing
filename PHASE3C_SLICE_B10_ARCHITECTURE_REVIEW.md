# Phase 3C — Slice B10: Architecture Review

> **Status:** Review only. No implementation. This document answers the question the user posed — whether legacy-field retirement is actually the safest next slice — against the current codebase, not against the roadmap's original assumption.
> **Baseline reviewed against:** `v1.41.0-phase3c-b9-capability-enforcement`.

## 1. Verdict, up front

**No — legacy-field retirement is not safe as the next slice, and the gap is wider than the roadmap assumed.** `User.role` is not a decaying fallback; it is currently the *only* live source of authorization truth for every account created since Slice B3 deployed, because nothing has ever been built to keep issuing `PersonRole` grants going forward (§2). `Participant.user_id` is not a dual-read at all; it is the sole mechanism actually used for row-level ownership scoping today, and `person_id` — though populated everywhere `user_id` is — is read by zero code paths (§3). Retiring either field now would break real, live functionality, not just theoretical edge cases.

**Recommendation: redefine B10 as another single-endpoint capability migration** — specifically `GET /api/participants/{participant_id}` (§5) — and treat legacy-field retirement as its own future, multi-slice initiative that needs its own dedicated review once two prerequisite gaps (§2, §7) are actually closed. This is exactly the outcome the user invited in their framing.

---

## 2. Is `User.role` still referenced anywhere that affects production behavior? — Yes, decisively, and the dependency is growing, not shrinking

Traced the full history of how `PersonRole` rows actually get created, not just how they get read:

| Migration | What it backfills | When it ran |
|---|---|---|
| `f3a8d1c6b9e2` (B1) | `Person` rows, one per `User` that existed at deploy time | Once, at B1's deploy |
| `b4e6a1d9c3f7` (B3) | `PersonRole` rows, one per `Person` whose joined `User.role` matched a seeded role code | **Once, at B3's deploy** — a snapshot, not an ongoing sync |
| `d5a9e2c7f3b1` (B7) | `Person` rows only, for the B1→B7 gap window | Once, at B7's deploy — explicitly does **not** backfill `PersonRole` (confirmed by reading the file: it only touches the `people` table) |

Cross-checked against `api/routers/auth.py::register()` (current code): registration creates a `User`, then a `Person` — **it never creates a `PersonRole`**. No other code path in `api/` ever instantiates `PersonRole` at all (`grep -r "PersonRole(" api/` matches only the model's own class definition).

**Conclusion: `PersonRole` rows exist only for the finite set of accounts that existed in production at the moment B3 deployed (2026-07-20).** Every account created since then — including the entire B7 gap-window population, and every real registration during B5 through B9's own validation work — has a `Person` but zero `PersonRole` rows, and resolves 100% through the legacy fallback branch in both `has_permission()` and `has_capability()`. The dual-read is real and correct where `PersonRole` data exists, but nothing is growing that dataset going forward — it is a fixed, aging snapshot, while the live-fallback population only ever increases. This directly contradicts the "legacy field is being phased out" framing the retirement plan assumed.

**Two additional production behaviors read `User.role` directly, bypassing the dual-read entirely:**

- `GET /admin/permissions/me` (`api/routers/admin_permissions.py:20-26`) returns `current_user.role` and computes `permissions_for_role(current_user.role)` directly — never consulting `PersonRole` at all. Any account with an active `PersonRole` that diverges from its legacy `User.role` (the exact forward-compatibility scenario B3/B5/B8/B9 all use as their proof case) gets a **wrong answer** from this specific endpoint. This was missed when B3 introduced the dual-read — `has_permission()` was updated, this endpoint's direct field read was not.
- The three role-mutation endpoints in `auth.py` (`update_user_role`, `update_user_role_by_email`, `update_user_role_by_email_body`, lines 162–299) only ever write `user.role = new_role`. None of them create, update, or revoke a `PersonRole` row. **Concrete, live consequence**: for any account that already has a `PersonRole` from B3's one-time backfill, using any of these admin endpoints to change that user's role today has **no effect on their actual resolved permissions** — `has_permission()`/`has_capability()` still honor the old, now-stale `PersonRole` grant, since PersonRole-first resolution takes precedence over the legacy field it silently updated. This is not a hypothetical: it is the exact, present behavior of the only role-management UI this project has. B0's original call-site audit flagged this as a "needs a grant/revoke redesign" item; it remains unaddressed.

Both are flagged here, not fixed — they're pre-existing, out of scope for a review, and exactly the kind of finding this project's standing practice is to surface rather than silently patch (`CLAUDE.md` § Recommended Practices). **Recommend logging both in `KNOWN_TECHNICAL_DEBT.md`** regardless of what B10 becomes; the second one in particular means any admin who has changed a pre-B3 account's role since B3 deployed may not have gotten the effect they intended, which is worth an explicit note even before it's fixed.

---

## 3. Is `Participant.user_id` still referenced anywhere that affects production behavior? — Yes: it is the *only* thing used for row-level ownership scoping

`api/services/participant_identity.py` — which backs both `GET /api/participants/mine` (now capability-enforced by B9) and `GET /api/participants/{participant_id}` — filters exclusively on `Participant.user_id`:

```python
.filter(Participant.user_id == current_user.id, Participant.removed_at.is_(None))   # list_own_registrations
...
if participant is None or participant.user_id is None or str(participant.user_id) != str(current_user.id):  # get_own_participant_or_404
```

Neither function references `person_id` anywhere. B9 changed *whether* the participant role can reach these endpoints (the permission gate) — it did not touch, and did not need to touch, *which rows* a caller sees once granted (the ownership filter). Those are two genuinely separate concerns, and only the first one has moved to the capability engine so far.

`person_id` is written everywhere `user_id` is (confirmed in B7's work: `public_registration.py`, `participant_claiming.py` both set both columns), but it is **read by zero application code** for scoping, authorization, or anything else — it is still exactly the write-only, forward-looking column B2/B7 left it as.

**Conclusion**: retiring `Participant.user_id` today would remove the only mechanism this endpoint pair actually uses to decide which rows belong to the caller. There is no `person_id`-based replacement query written, reviewed, or tested anywhere in the codebase yet. This is a harder blocker than the `User.role` question — it isn't a matter of confidence in already-built infrastructure, it's that the replacement logic doesn't exist at all.

---

## 4. Which endpoints still depend on legacy authorization?

Enumerated by dependency, across every router in `api/routers/`:

| Dependency | Endpoint count | Files |
|---|---|---|
| `require_capability(...)` | **1** | `participant_self.py` (`GET /api/participants/mine` only) |
| `require_permission(...)` | ~27 | `admin_communications.py` (9), `admin_automation.py` (6), `admin_event_operations.py` (4), `admin_volunteers.py` (8), `participant_self.py` (1 — `GET /api/participants/{participant_id}`) |
| `require_admin` (→ `has_permission(user, PERMISSION_ADMIN_ACCESS)`) | ~90+ | `admin_events.py` (18), `admin_audit.py` (1), `admin_analytics.py` (2), `admin_permissions.py` (2, one of which bypasses `has_permission` entirely — §2), `admin_event_templates.py` (7), `admin_dashboard.py` (4), `admin_participants.py` (14), `auth.py` (4), `admin_waiver_templates.py` (8), `events.py` (1), `waivers.py` (11) |

Every one of these already calls `has_permission()`, which has been `PersonRole`-first/legacy-fallback since B3 — so the *authorization decision itself* is already dual-read-aware everywhere. What hasn't happened yet is routing that decision through `require_capability()`/`has_capability()` specifically. Migrating any of these is mechanically identical to what B9 already did once: swap the dependency, no schema change, no behavior change for any account whose `PersonRole` and legacy `role` agree (which, per §2, is every account with `PersonRole` data at all — the two engines are proven equivalent, not just for this one permission but for the underlying resolution logic itself).

---

## 5. Recommendation: another capability migration first, and which endpoint

**`GET /api/participants/{participant_id}`** (`api/routers/participant_self.py`, currently `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)`) is the safest next candidate, for a reason stronger than "it's small": **it is the sibling of the one permission B9 already proved live.** Same permission string, same user population (`participant` role), same file, same author, `require_capability` already imported in this exact module. Migrating it isn't new evidence-gathering — it completes the one permission this rollout has fully validated end-to-end, rather than opening a second, unproven mapping.

Runner-up considered and rejected for *this* slice: `GET /admin/permissions/me`. It's small and read-only, but it currently has the direct-legacy-read bug described in §2 — migrating it would require fixing that bug as part of the same change, which is scope creep beyond "one dependency swap." Better handled as its own small, separately-authorized correctness fix, independent of any capability migration.

---

## 6. Comparison: immediate legacy-field retirement vs. another capability migration

| | Legacy-field retirement (original B10) | Capability migration (`GET /participants/{participant_id}`) |
|---|---|---|
| **Backward compatibility** | Breaks authorization for every account without `PersonRole` data (per §2, a large and growing population) and breaks the only working role-management endpoints (per §2) | Total — same permission, same endpoint pair B9 already validated; the only user-visible change is which function decides, not what it decides |
| **Schema change** | Destructive — dropping `User.role`/`Participant.user_id` columns, not additive | None |
| **Rollback** | Not trivial — a dropped column needs data restored to bring back, unlike every slice since B1 | Single commit, single dependency swap, no data implications — identical shape to B9 |
| **Deployment risk** | High — requires solving two undesigned problems first (ongoing `PersonRole` issuance at registration/role-change time; a `person_id`-based row-scoping replacement) before a column can safely disappear | Minimal — no migration, mechanically identical to a slice already run in production once |
| **Production validation plan** | Would need to prove zero accounts anywhere still depend on the field before dropping it — not currently provable, per §2/§3 | Same shape as B9: participant-owns-record → `200`; participant-doesn't-own → `404` (unchanged, ownership scoping untouched); anonymous → `401`; admin → `403` (regression, unchanged); fail-closed error path; log check |
| **Observation window** | Would need to be long enough to catch any account/endpoint combination reliant on the legacy field — hard to bound with confidence given §2/§3's findings | Same standard window as B6–B9 |
| **Fits "additive architecture unless explicitly authorized otherwise"** | No — this is precisely the kind of change that rule exists to gate | Yes |

---

## 7. What real legacy-field retirement would require first (not proposed as work now)

Flagging for the roadmap, not proposing as the next slice: before `User.role`/`Participant.user_id` retirement is realistically reviewable, two separate problems need their own design and their own slices —

1. **Ongoing `PersonRole` issuance**: registration must start granting a `PersonRole`, and the three role-mutation endpoints must start writing `PersonRole` grants/revocations instead of (or alongside) the legacy field — otherwise the population in §2 never stops growing, and every mutation continues to silently disagree with itself.
2. **`person_id`-based row scoping**: `participant_identity.py`'s two functions need a real, tested query against `person_id`, proven equivalent to the current `user_id` filter, before `user_id` can be considered redundant for that purpose.

Both are legitimate future roadmap items — likely **B11 and B12**, each meriting its own architecture review — not something to fold into B10.

---

## 8. Recommended sequencing (redefinition)

- **B10 (redefined)**: migrate `GET /api/participants/{participant_id}` to `require_capability(PERMISSION_PARTICIPANTS_VIEW_OWN)`, completing this rollout's one fully-proven permission across both endpoints that use it.
- **B11+ (future, not authorized, no review started)**: the actual legacy-field retirement program — PersonRole issuance parity, then person_id-based row scoping, then (only after both are proven in production) the column drops themselves. Each gets its own dedicated review when the user brings it forward, per the pattern already established for every behavior-changing slice in this project.

## 9. Expected files for the recommended B10 (redefined)

| File | Change |
|---|---|
| `api/routers/participant_self.py` | `get_own_participant()`'s dependency changes from `require_permission(PERMISSION_PARTICIPANTS_VIEW_OWN)` to `require_capability(PERMISSION_PARTICIPANTS_VIEW_OWN)`. `require_capability` is already imported in this file from B9. |
| New/extended tests | Mirroring `tests/test_participants_mine_capability_enforcement.py`'s shape for this route: positive (owner), negative (non-owner → `404`, unchanged), anonymous (`401`), admin (`403`, regression), fail-closed error path, denial logging. |
| `api/dependencies.py`, `api/services/capability_resolution.py` | **No changes** — `require_capability()` and the engine already exist and are reused as-is, same as every slice since B5. |

No migration, no schema change.

## 10. Smallest independently deployable vertical slice

Exactly the one dependency swap above — a single line change plus its test coverage. Same shape and size as B9's own diff, on the one remaining endpoint that shares its already-proven permission.

---

## 11. Summary of what needs the user's decision

1. Accept the redefinition: B10 = migrate `GET /api/participants/{participant_id}`, not legacy-field retirement?
2. Should the two findings in §2 (`GET /admin/permissions/me`'s direct legacy-role read; role-mutation endpoints never touching `PersonRole`) be logged in `KNOWN_TECHNICAL_DEBT.md` now, independent of B10?
3. Confirm B11/B12 (PersonRole issuance parity; person_id-based row scoping) as the future prerequisites for real legacy-field retirement, deferred with no review started yet.

No code has been written. Awaiting your decision before any implementation.
