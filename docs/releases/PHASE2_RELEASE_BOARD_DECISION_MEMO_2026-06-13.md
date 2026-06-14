# Release Board Decision Memo

## Project
Surfers for Autism Admin PWA

## Review Scope
Production baseline: v1.0.0 @ 666b5a4

Engineering snapshot reviewed: 108a1d9

This review evaluated repository state, operational workflow execution, security posture, configuration management, data protection considerations, and release governance.

---

## Operational Validation
An isolated runtime validation was executed using a temporary SQLite database to avoid modifying the primary repository database.

The following workflow completed successfully:

- Admin registration
- Admin login
- Event creation
- Participant creation
- Waiver delivery creation
- Public waiver retrieval
- Public waiver signing
- PDF generation
- Metrics retrieval
- CSV export

Expected HTTP responses (200/201) were received and resulting artifacts were validated.

Repository hygiene was restored after testing, with only the two previously known untracked waiver PDF files remaining.

Functional Readiness Determination: PASS

---

## Production Release Blockers
The following issues must be resolved prior to production deployment.

### 1) Debug configuration safety
Current configuration allows DEBUG mode to default to an unsafe state and exposes a development privilege escalation route when enabled.

Required action:
- Production must explicitly disable debug functionality.
- Development-only routes must never be reachable in production.

### 2) Secret key management
Application startup currently permits an insecure fallback signing secret if environment configuration is absent.

Required action:
- Production startup must require an explicit secret key.
- Startup must fail rather than silently using a default value.

### 3) Hardcoded signing origin
Signing URLs are hardcoded in backend and frontend components.

Required action:
- Replace hardcoded origins with environment-configurable canonical URLs to support development, staging, and production deployments.

### 4) Backup and restore policy for legal PDF artifacts
Waiver PDFs are stored as filesystem artifacts separate from database migrations.

Required action:
- Establish and document backup and restore procedures that include these legal records alongside database backups.

---

## Engineering Improvements (Non-Blocking)
The following items should be tracked but do not independently block release unless governance explicitly requires otherwise:

- Simulated delivery provider implementation (acceptable if documented release scope)
- Lint debt requiring cleanup
- Runtime create_all behavior alongside migration management
- Authentication hardening enhancements (rate limiting, refresh/revocation), absent evidence of active exploitability

---

## Repository Asset Recommendation
Current duplicate waiver PDFs should not be committed unless explicitly designated as production assets.

Recommended policy:
- Exclude generated/documentation duplicates from version control.
- Commit public legal assets only when supported by documented product requirements and release traceability.

---

## Release Board Determination

### Functional Readiness
PASS

The primary business workflow has been successfully exercised end-to-end under runtime conditions.

### Production Readiness
NO-GO

Production release must not proceed until the four identified release blockers have been remediated or formally accepted through documented governance.

### Recommendation
After remediation of the release blockers, perform a focused verification of those changes and reconvene the Release Board for a final Go/No-Go decision.
