# Project Baseline v1.22.0-beta-rc1 (Candidate)

Baseline date: 2026-07-05
Candidate release tag: v0.2.0-rc.1
Baseline type: Beta/RC candidate

## Baseline Intent

This file records the current release-candidate baseline for the Admin PWA.
It supplements historical baseline artifacts and does not replace prior release baseline documentation.

## Candidate Scope Summary

Included in this candidate baseline:

- Dashboard enhancements, live telemetry, attention panel, and today overview.
- Global search and dashboard preferences.
- Bulk participant actions and universal command palette.
- Cross-feature UI polish and stabilization.
- RC release metadata, release notes, and testing/readiness updates.

Explicitly excluded:

- New architecture design work.
- Deferred roadmap domains and provider expansion.
- Historical governance/phase document rewrites.

## Validation Posture

- Frontend lint passed for release candidate prep.
- Frontend production build passed for release candidate prep.
- Release preflight script runs and enforces clean-tree release gate.

## Promotion Conditions

1. Release-prep files are committed in a scoped release commit.
2. Repository is clean at release head.
3. Release preflight passes from that clean state.
4. Annotated tag `v0.2.0-rc.1` is created from the validated release commit.
