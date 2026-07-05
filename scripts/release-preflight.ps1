param(
    [switch]$SkipFrontendBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-PythonExecutable {
    $venvPython = Join-Path $PSScriptRoot "..\venv\Scripts\python.exe"
    $venvPython = [System.IO.Path]::GetFullPath($venvPython)

    if (Test-Path $venvPython) {
        return $venvPython
    }

    return "python"
}

Write-Step "Checking git working tree is clean"
$gitStatus = git status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "git status failed. Ensure git is installed and this is a git repository."
}
if ($gitStatus) {
    throw "Working tree is not clean. Commit or stash changes before releasing."
}

Write-Step "Running backend syntax check (compileall)"
$pythonExe = Get-PythonExecutable
& $pythonExe -m compileall -q api
if ($LASTEXITCODE -ne 0) {
    throw "Backend syntax check failed."
}

if (-not $SkipFrontendBuild) {
    Write-Step "Ensuring frontend dependencies exist"
    $nodeModulesPath = Join-Path $PSScriptRoot "..\admin-app\node_modules"
    $nodeModulesPath = [System.IO.Path]::GetFullPath($nodeModulesPath)

    if (-not (Test-Path $nodeModulesPath)) {
        Write-Step "Installing frontend dependencies (npm ci)"
        npm --prefix admin-app ci
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed."
        }
    }

    Write-Step "Building frontend"
    npm --prefix admin-app run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed."
    }
}

Write-Step "Preflight checks passed"
Write-Host "Release preflight complete." -ForegroundColor Green
