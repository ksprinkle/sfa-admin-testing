param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [string]$Message,

    [switch]$SkipPreflight,

    [switch]$SkipFrontendBuild,

    [switch]$Push
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

if (-not $SkipPreflight) {
    Write-Step "Running release preflight"
    $preflightScript = Join-Path $PSScriptRoot "release-preflight.ps1"

    if ($SkipFrontendBuild) {
        & $preflightScript -SkipFrontendBuild
    }
    else {
        & $preflightScript
    }
}

Write-Step "Checking whether tag already exists"
$existingTag = git tag -l $Version
if ($LASTEXITCODE -ne 0) {
    throw "Failed to list git tags."
}
if ($existingTag) {
    throw "Tag '$Version' already exists. Choose a new version."
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "SFA release $Version ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"
}

Write-Step "Creating annotated tag"
git tag -a $Version -m $Message
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create git tag."
}

if ($Push) {
    Write-Step "Pushing tag to origin"
    git push origin $Version
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to push tag to origin."
    }
    Write-Host "Tag $Version created and pushed." -ForegroundColor Green
}
else {
    Write-Host "Tag $Version created locally." -ForegroundColor Green
    Write-Host "Push when ready with: git push origin $Version"
}
