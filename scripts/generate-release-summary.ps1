param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [string]$AdminUrl,

    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,

    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

$repoRoot = Join-Path $PSScriptRoot ".."
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot)
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $releaseDir = Join-Path $repoRoot "release-notes"
    if (-not (Test-Path $releaseDir)) {
        New-Item -ItemType Directory -Path $releaseDir | Out-Null
    }
    $OutputPath = Join-Path $releaseDir ("{0}.md" -f $Version)
}

Write-Step "Collecting git metadata"
$commitHash = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve current commit hash."
}

$commitShort = (git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve short commit hash."
}

$branchName = (git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to resolve branch name."
}

$generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"

$summary = @"
# Release Summary - $Version

## Build Metadata
- Version: $Version
- Generated At: $generatedAt
- Branch: $branchName
- Commit: $commitHash
- Short Commit: $commitShort

## Deployment Targets
- Admin App: $AdminUrl
- API Base URL: $ApiUrl
- WebSocket URL: $($ApiUrl -replace '^http', 'ws')/api/ws/updates

## Pre-Event Verification
1. Open admin app on two devices over cellular and log in.
2. Check in one participant on Device A and confirm Device B auto-updates.
3. Put Device A in airplane mode, check in 2 participants, confirm queue indicator appears.
4. Re-enable data and confirm queue drains to zero.
5. Confirm Device B receives queued updates without manual refresh.

## Incident Fallbacks
1. If one device loses signal, continue offline check-ins on that device.
2. Keep app open after reconnect until queue drains.
3. Use a backup logged-in device if one device is unstable.
4. Do not clear local storage until queue is confirmed empty.

## Sign-Off
- Tech Lead:
- Event Lead:
- Date:
"@

Write-Step "Writing release summary"
Set-Content -Path $OutputPath -Value $summary -Encoding UTF8

Write-Host "Release summary created: $OutputPath" -ForegroundColor Green
