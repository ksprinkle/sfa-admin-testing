# Release Blocker (RB-XX) Remediation Template

## Release Block
Ticket: RB-03

Title:
Configurable canonical signing origin

Objective:
Remove hardcoded production signing origins and make waiver signing URL origin environment-configurable for development, staging, and production.

---

## Scope
This PR addresses only the approved Release Blocker identified in the Phase 2 Release Board Decision Memo.

No feature development, refactoring, or unrelated cleanup is included.

---

## Files Changed
List all modified files:

- api/config.py
- api/services/waiver_delivery.py
- admin-app/src/api/baseUrl.js
- render.yaml
- docs/releases/PHASE2_RELEASE_BLOCKER_REMEDIATION_SPRINT_2026-06-13.md
- docs/releases/RB-03_REMEDIATION_EVIDENCE_2026-06-13.md

---

## Implementation Summary
Describe:

- What was changed
  - Added backend `CANONICAL_SIGNING_ORIGIN` setting resolution in `api/config.py`.
  - Added origin normalization/validation and production guardrail:
    - Accept explicit `CANONICAL_SIGNING_ORIGIN`.
    - Fallback to `RENDER_EXTERNAL_URL` when available.
    - Fail fast in production if neither is available.
    - Use a local development fallback only in non-production mode.
  - Updated signing URL generation in `api/services/waiver_delivery.py` to use configured canonical origin from settings.
  - Removed hardcoded production API domain from frontend `admin-app/src/api/baseUrl.js` and replaced with runtime origin fallback when `VITE_API_URL` is unset/invalid.
  - Documented config key in `render.yaml` (`CANONICAL_SIGNING_ORIGIN`).
- Why it was changed
  - RB-03 requires that signing origin be environment-configurable and not hardcoded to one production domain.
- How the solution satisfies the Release Board requirement
  - Signing URL origin now comes from environment/configuration.
  - Development, staging, and production origins are supported without code edits.
  - Hardcoded production origin was removed from signing URL construction paths.

---

## Validation Performed

### Targeted Validation

- Validation executed
  - Environment smoke checks for signing URL generation:
    - Development fallback origin
    - Staging explicit canonical origin
    - Production explicit canonical origin
    - Production `RENDER_EXTERNAL_URL` fallback
    - Production missing-origin negative case (fail fast)
  - Public signer retrieval path verified in router (`/sign/{token}` endpoint exists under `/api/waivers`).
- Expected behavior confirmed

Evidence:

```text
[
  {
    "name": "development-fallback-origin",
    "exit_code": 0,
    "result": {
      "ok": true,
      "url": "http://127.0.0.1:8000/api/waivers/sign/demo-token"
    },
    "stderr": ""
  },
  {
    "name": "staging-explicit-origin",
    "exit_code": 0,
    "result": {
      "ok": true,
      "url": "https://staging-api.example.org/api/waivers/sign/demo-token"
    },
    "stderr": ""
  },
  {
    "name": "production-explicit-origin",
    "exit_code": 0,
    "result": {
      "ok": true,
      "url": "https://api.example.org/api/waivers/sign/demo-token"
    },
    "stderr": ""
  },
  {
    "name": "production-render-fallback-origin",
    "exit_code": 0,
    "result": {
      "ok": true,
      "url": "https://sfa-api.onrender.com/api/waivers/sign/demo-token"
    },
    "stderr": ""
  },
  {
    "name": "production-missing-origin-denied",
    "exit_code": 0,
    "result": {
      "ok": false,
      "error": "CANONICAL_SIGNING_ORIGIN (or RENDER_EXTERNAL_URL) is required in production to build public signing URLs."
    },
    "stderr": ""
  }
]

Public signer route check:
- @router.get("/sign/{token}") in api/routers/waivers.py
- Function: get_public_waiver_signing_page
```

---

### Regression Check
Verify that existing functionality continues to operate.

- No observed regression in RB-03 scope (settings parsing, signing URL assembly, frontend API base fallback behavior).

Evidence:

```text
Static diagnostics:
- api/config.py: No errors found
- api/services/waiver_delivery.py: No errors found
- admin-app/src/api/baseUrl.js: No errors found
- render.yaml: No errors found
```

---

### Repository Hygiene

- No unrelated file modifications
- Working tree reviewed
- Only intended files included

Evidence:

```text
Pre-commit git status --short:
 M admin-app/src/api/baseUrl.js
 M api/config.py
 M api/services/waiver_delivery.py
 M render.yaml
 M docs/releases/PHASE2_RELEASE_BLOCKER_REMEDIATION_SPRINT_2026-06-13.md
?? docs/releases/RB-03_REMEDIATION_EVIDENCE_2026-06-13.md
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
fix(release): externalize canonical signing origin for RB-03
```

Commit hash:

```text
Captured from the single scoped fix(release) commit for RB-03.
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
- [ ] RB-02
- [x] RB-03
- [ ] RB-04

Remaining blockers:

- [ ] RB-04

(Leave unchecked if still outstanding.)

---

## Stop Condition
After completion of this blocker:

- Stop implementation.
- Report evidence.
- Await approval before proceeding to the next Release Blocker.