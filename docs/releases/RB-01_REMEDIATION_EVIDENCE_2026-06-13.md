# Release Blocker (RB-XX) Remediation Template

## Release Block
Ticket: RB-01

Title:
Production-safe debug controls

Objective:
Make debug behavior safe by default and prevent dev-only auth elevation routes from being exposed in production.

---

## Scope
This PR addresses only the approved Release Blocker identified in the Phase 2 Release Board Decision Memo.

No feature development, refactoring, or unrelated cleanup is included.

---

## Files Changed
List all modified files:

- api/config.py
- api/main.py
- api/routers/auth.py
- docs/releases/PHASE2_RELEASE_BLOCKER_REMEDIATION_SPRINT_2026-06-13.md
- docs/releases/RB-01_REMEDIATION_EVIDENCE_2026-06-13.md

---

## Implementation Summary
Describe:

- What was changed
  - Changed DEBUG default to false (safe-by-default).
  - Added production detection and explicit startup fail-fast when DEBUG=true in production.
  - Added `DEV_ROUTES_ENABLED` gate and used it to register dev-only auth route only in non-production debug mode.
  - Added startup guardrail that raises at startup if any `/api/auth/dev/*` route is registered when dev routes are disabled.
  - Restricted `/debug/routes` route to dev-route-enabled mode only.
- Why it was changed
  - RB-01 requires production-safe debug controls and non-exposure of dev-only auth elevation paths.
- How the solution satisfies the Release Board requirement
  - Production defaults are now safe.
  - Production startup denies unsafe debug mode.
  - Production route list no longer includes dev-only routes.

---

## Validation Performed

### Targeted Validation

- Validation executed
  - Case A: production-safe routes (`APP_ENV=production`, `DEBUG=false`) confirms dev-only routes absent.
  - Case B: production debug misconfig (`APP_ENV=production`, `DEBUG=true`) fails fast.
  - Case C: explicit development debug (`DEBUG=true`) confirms dev route is available in dev mode.
- Expected behavior confirmed

Evidence:

```text
Case A (production-safe routes):
{
  "exit_code": 0,
  "result": {
    "has_debug_routes": false,
    "has_dev_promote": false,
    "route_count": 61
  },
  "stderr": ""
}

Case B (production debug=true denied):
{
  "name": "production-debug-true-denied",
  "exit_code": 0,
  "result": {
    "import_ok": false,
    "error": "Unsafe configuration: DEBUG=true is not allowed when running in production environment. Set DEBUG=false to start the application."
  },
  "stderr": ""
}

Case C (dev debug=true route enabled):
{
  "name": "dev-debug-true-route-enabled",
  "exit_code": 0,
  "result": {
    "import_ok": true,
    "debug": true,
    "is_production": false,
    "dev_routes_enabled": true,
    "has_dev_promote": true
  },
  "stderr": ""
}
```

---

### Regression Check
Verify that existing functionality continues to operate.

- No observed regression in RB-01 scope (config import, auth router registration, and startup guardrail behavior).

Evidence:

```text
Static diagnostics:
- api/config.py: No errors found
- api/main.py: No errors found
- api/routers/auth.py: No errors found
```

---

### Repository Hygiene

- No unrelated file modifications
- Working tree reviewed
- Only intended files included in staged set

Evidence:

```text
Pre-commit git status --short:
 M api/config.py
 M api/main.py
 M api/routers/auth.py
 M docs/releases/PHASE2_RELEASE_BLOCKER_REMEDIATION_SPRINT_2026-06-13.md
?? docs/releases/RB-01_REMEDIATION_EVIDENCE_2026-06-13.md
?? admin-app/docs/assets/SFA Liability Waiver.pdf
?? admin-app/public/SFA Liability Waiver.pdf

Post-commit git status --short:
?? admin-app/docs/assets/SFA Liability Waiver.pdf
?? admin-app/public/SFA Liability Waiver.pdf
```

---

## Commit Information
Commit:

```text
fix(release): harden production debug controls for RB-01
```

Commit hash:

```text
Captured from the single scoped fix(release) commit for RB-01.
```

---

## Acceptance Criteria

- Release blocker resolved
- Validation completed
- Repository hygiene verified
- Scoped commit created

---

## Release Board Status
Current blocker:

- [x] RB-01
- [ ] RB-02
- [ ] RB-03
- [ ] RB-04

Remaining blockers:

- [ ] RB-02
- [ ] RB-03
- [ ] RB-04

(Leave unchecked if still outstanding.)

---

## Stop Condition
After completion of this blocker:

- Stop implementation.
- Report evidence.
- Await approval before proceeding to the next Release Blocker.