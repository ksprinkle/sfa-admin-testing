# Project Baseline v1.0.0

Release date: 2026-06-13
Release tag: v1.0.0
Production commit: 666b5a4
Branch at release: master

## Baseline Authority Statement
v1.0.0 is the authoritative baseline for all future development in this repository.
All post-release work must be planned and implemented relative to this baseline.

## Governance Rules Used
The release was governed by the established Repository Custodian model and release freeze rules:

- Repository Custodian gate enforced clean, controlled repository state before promotion.
- No feature mixing in release-phase commits.
- Allowed changes during freeze: deployment fixes, critical bug fixes, documentation corrections.
- Disallowed during freeze: feature additions, architecture redesign, unrelated behavior changes.
- Tagging rule honored: do not move existing tags; promote only the exact validated commit.

## Release Criteria
Promotion to v1.0.0 required deterministic pass conditions:

- Operational Business Evidence: PASS.
- Service Worker Disposition: FIXED or ACCEPTED.
- Repository state checks: clean working tree, expected HEAD, preserved stash, no unintended uncommitted changes.
- Exact commit verification before tagging.

Final outcome used for promotion:

- Operational Business Evidence: PASS.
- Service Worker Disposition: FIXED.
- Repository Custodian checks: PASS.

## Architecture Baseline
The following architecture and deployment decisions are baseline-locked at v1.0.0:

- Backend start command: uvicorn api.main:app.
- Backend build command: pip install -r api/requirements.txt.
- Python import root policy: use api.* imports for deployment consistency.
- Authentication pattern: OAuth2PasswordRequestForm with username field set to email.
- Dependency guardrail: bcrypt pinned to 3.2.2 to avoid known passlib breakage.
- Admin web application is built from admin-app and published via docs for static hosting.

## Deferred Roadmap Items
Items not included in v1.0.0 remain deferred until post-acceptance planning:

- Any new feature development outside release-critical scope.
- Any architectural redesign proposals.
- Roadmap expansion beyond validated v1.0.0 behavior.

Reference planning sources remain:

- ROADMAP_INTENT.md
- PROJECT_SYNC_BRIEF.md

## Preserved Stash Location
A preserved stash remains intentionally untouched pending production acceptance:

- stash@{0}: On master: rc1-pre-regression-sweep-clean-start-2026-06-07

Policy reminder:

- Do not restore the preserved stash until production acceptance.

## Post-Release Working Rule
After production acceptance:

- Keep v1.0.0 as the historical baseline marker.
- Restore preserved stash only when explicitly approved.
- Begin subsequent roadmap work from the v1.0.0 baseline lineage.
