# Release Blocker (RB-XX) Remediation Template

## Release Block
Ticket: RB-02

Title:
Secret key enforcement

Objective:
Require explicit strong signing secrets in production and fail startup when secret configuration is missing or invalid.

---

## Scope
This PR addresses only the approved Release Blocker identified in the Phase 2 Release Board Decision Memo.

No feature development, refactoring, or unrelated cleanup is included.

---

## Files Changed
List all modified files:

- api/config.py
- docs/releases/PHASE2_RELEASE_BLOCKER_REMEDIATION_SPRINT_2026-06-13.md
- docs/releases/RB-02_REMEDIATION_EVIDENCE_2026-06-13.md

---

## Implementation Summary
Describe:

- What was changed
  - Added `_resolve_backend_secret_key` to centralize signing-secret policy.
  - Production now requires explicit `BACKEND_SECRET_KEY` (or `SECRET_KEY`) and rejects:
    - Missing values
    - Known weak development defaults
    - Values shorter than 32 characters
  - Development policy is documented in code and allows fallback only outside production (`dev-secret-key-local-only`).
- Why it was changed
  - RB-02 requires removing insecure fallback behavior and enforcing production startup safety.
- How the solution satisfies the Release Board requirement
  - Production startup now fails fast on missing/invalid secret.
  - Production startup succeeds only when a strong explicit secret is configured.
  - Development behavior remains explicit and documented.

---

## Validation Performed

### Targeted Validation

- Validation executed
  - Case A: Production without secret fails fast.
  - Case B: Production with invalid weak secret fails fast.
  - Case C: Production with explicit strong secret succeeds.
  - Case D: Development without secret succeeds with documented fallback policy.
- Expected behavior confirmed

Evidence:

```text
[
  {
    "name": "prod-missing-secret-denied",
    "exit_code": 0,
    "result": {
      "import_ok": false,
      "error": "BACKEND_SECRET_KEY (or SECRET_KEY) is required in production. Refusing to start without an explicit signing secret."
    },
    "stderr": ""
  },
  {
    "name": "prod-invalid-secret-denied",
    "exit_code": 0,
    "result": {
      "import_ok": false,
      "error": "Invalid production signing secret. Configure BACKEND_SECRET_KEY with a strong value (minimum 32 characters, not a known development default)."
    },
    "stderr": ""
  },
  {
    "name": "prod-explicit-strong-secret-allowed",
    "exit_code": 0,
    "result": {
      "import_ok": true,
      "is_production": true,
      "secret_len": 41,
      "secret_preview": "prod-sup"
    },
    "stderr": ""
  },
  {
    "name": "dev-no-secret-fallback-allowed",
    "exit_code": 0,
    "result": {
      "import_ok": true,
      "is_production": false,
      "secret_len": 25,
      "secret_preview": "dev-secr"
    },
    "stderr": ""
  }
]
```

---

### Regression Check
Verify that existing functionality continues to operate.

- No observed regression in RB-02 scope (settings import and signing secret resolution behavior).

Evidence:

```text
Static diagnostics:
- api/config.py: No errors found
```

---

### Repository Hygiene

- No unrelated file modifications
- Working tree reviewed
- Only intended files included

Evidence:

```text
Pre-commit git status --short:
 M api/config.py
 M docs/releases/PHASE2_RELEASE_BLOCKER_REMEDIATION_SPRINT_2026-06-13.md
?? docs/releases/RB-02_REMEDIATION_EVIDENCE_2026-06-13.md
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
fix(release): enforce production signing secret for RB-02
```

Commit hash:

```text
Captured from the single scoped fix(release) commit for RB-02.
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

- [ ] RB-01
- [x] RB-02
- [ ] RB-03
- [ ] RB-04

Remaining blockers:

- [ ] RB-03
- [ ] RB-04

(Leave unchecked if still outstanding.)

---

## Stop Condition
After completion of this blocker:

- Stop implementation.
- Report evidence.
- Await approval before proceeding to the next Release Blocker.