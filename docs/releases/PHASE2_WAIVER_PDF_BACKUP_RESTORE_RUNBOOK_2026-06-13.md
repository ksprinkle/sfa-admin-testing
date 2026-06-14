# Phase 2 Waiver PDF Backup and Restore Runbook

## Purpose
Define an operational backup and restore procedure that treats waiver PDF legal artifacts and database records as one recovery unit.

## Scope
The backup scope for waiver legal records includes:

- Database file (local validation profile):
  - `sfa.db`
- Generated waiver archive PDFs (when present):
  - `storage/waiver_pdfs/`
- Published waiver PDF legal assets:
  - `admin-app/public/SFA Liability Waiver.pdf`
  - `admin-app/docs/assets/SFA Liability Waiver.pdf`

Recovery must restore all scope items together from the same backup point.

## Backup Frequency and Retention
- Daily backups: retain 35 days.
- Weekly backups: retain 12 weeks.
- Monthly backups: retain 12 months.
- Immutable copy: at least one backup per release candidate and one backup for production release sign-off.

## Ownership and Responsibilities
- Operations/SRE:
  - Execute scheduled backups.
  - Verify backup job completion and storage durability.
  - Execute restore drill cadence.
- Backend Engineering:
  - Maintain schema compatibility and artifact path conventions.
  - Provide verification queries/checks for waiver record integrity.
- Release Manager:
  - Ensure dry-run evidence is attached to release governance artifacts.
  - Confirm RB-04 acceptance criteria before release board sign-off.

## Backup Procedure (PowerShell)
1. Create a timestamped backup root.
2. Copy database and artifact directories into the same backup set.
3. Generate a PDF hash manifest for integrity verification.

Example:

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "sfa-backup-$ts"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

Copy-Item sfa.db (Join-Path $backupRoot "sfa.db") -Force

if (Test-Path storage/waiver_pdfs) {
  Copy-Item storage/waiver_pdfs (Join-Path $backupRoot "storage/waiver_pdfs") -Recurse -Force
}

Copy-Item "admin-app/public/SFA Liability Waiver.pdf" (Join-Path $backupRoot "admin-app/public/SFA Liability Waiver.pdf") -Force
Copy-Item "admin-app/docs/assets/SFA Liability Waiver.pdf" (Join-Path $backupRoot "admin-app/docs/assets/SFA Liability Waiver.pdf") -Force
```

## Restore Procedure (PowerShell)
1. Restore into an isolated restore location first.
2. Validate DB and filesystem artifacts before any cutover.
3. Restore DB and artifacts together from the same timestamped set.

Example:

```powershell
$restoreRoot = Join-Path $env:TEMP "sfa-restore-$ts"
New-Item -ItemType Directory -Path $restoreRoot -Force | Out-Null

Copy-Item (Join-Path $backupRoot "*") $restoreRoot -Recurse -Force
```

## Verification Checks
Minimum acceptance checks for each restore drill:

- Database checks:
  - DB opens successfully.
  - `participant_waivers` table row count can be queried.
  - `waiver_pdf_artifacts` table exists and row count can be queried.
- Filesystem checks:
  - Expected waiver PDF files exist in restored set.
  - SHA-256 hash manifest of restored PDFs matches backup manifest.
- Consistency checks:
  - DB summary and PDF manifest comparison reports match between backup and restore.

## Restore Drill Cadence
- Mandatory dry run before production release sign-off.
- Monthly operational restore drill outside release windows.
- Additional drill after any major schema/storage path change.

## Failure and Escalation
- Any DB/PDF mismatch or missing artifact is a release blocker.
- Escalate to Engineering Lead + Operations Reviewer immediately.
- Record incident in release governance notes and rerun drill after remediation.