# Phase 2 Release Blocker Remediation Sprint

## Purpose
Resolve only production release blockers identified by the 2026-06-13 Release Board Decision Memo.

No feature work is permitted in this sprint.

## Scope Guardrails
- Allowed: blocker remediation, blocker validation, blocker documentation.
- Not allowed: roadmap expansion, Phase 3 work, UX redesign, non-blocker refactors.
- Governance baseline remains: v1.0.0 @ 666b5a4.
- Engineering snapshot under remediation: 108a1d9 line.

## Sprint Exit Criteria
All four blocker tickets complete, verified, and signed off, then end-to-end workflow revalidation executed.

---

## Ticket RB-01: Production-safe debug controls
Owner: Backend

Problem:
- DEBUG defaults unsafe.
- Dev-only privilege route can be exposed by configuration error.

Required outcomes:
- Production default is safe-by-default.
- Dev-only route(s) are hard-disabled in production.
- Add startup guardrails and explicit failure/denial behavior.

Acceptance criteria:
- Production-mode startup cannot expose dev-only auth elevation routes.
- Verified route list confirms absence of dev-only routes in production mode.
- Negative test documented in release notes/checklist.

---

## Ticket RB-02: Secret key enforcement
Owner: Backend/SRE

Problem:
- Insecure fallback signing secret is currently possible.

Required outcomes:
- Production requires explicit signing secret.
- Startup fails if secret is missing/invalid.
- Development secret policy documented.

Acceptance criteria:
- Production-mode startup fails fast without configured secret.
- Production-mode startup succeeds only with explicit secret.
- Validation evidence captured in release checklist.

---

## Ticket RB-03: Configurable canonical signing origin
Owner: Backend + Frontend

Problem:
- Signing origin is hardcoded in multiple places.

Required outcomes:
- Canonical signing origin comes from environment/configuration.
- Development, staging, and production are supported without code edits.

Acceptance criteria:
- No hardcoded production origin remains in signing URL path construction.
- Environment-specific deployment smoke-checks pass for signing link generation and public signer retrieval.
- Configuration keys documented.

---

## Ticket RB-04: Backup/restore policy for waiver PDF legal artifacts
Owner: Ops/SRE + Backend

Problem:
- Waiver PDFs are filesystem artifacts and not covered by DB-only backup assumptions.

Required outcomes:
- Document and approve backup scope including filesystem legal artifacts.
- Define restore procedure and verification checks.
- Define retention/recovery responsibilities.

Acceptance criteria:
- Written runbook exists and is linked in release docs.
- Backup and restore dry run completed and logged.
- Recovery verification confirms both DB records and PDF artifacts are restorable together.

---

## Post-Sprint Verification (Required)
Run focused release validation after RB-01..RB-04 completion:

- Admin login
- Event creation
- Participant creation
- Waiver delivery creation
- Public waiver retrieval
- Public waiver signing
- PDF generation and retrieval
- Metrics retrieval
- CSV export

Expected result:
- Functional readiness: PASS
- Production readiness: GO (only if all blocker acceptance criteria pass)

## Sign-off
- Engineering Lead: ____________________
- Release Manager: ____________________
- Security Reviewer: ____________________
- Operations Reviewer: ____________________
- Decision Date: ____________________
