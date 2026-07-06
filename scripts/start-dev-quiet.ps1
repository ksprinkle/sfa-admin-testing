param(
    [switch]$NoNewWindows
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendCwd = $repoRoot
$frontendCwd = Join-Path $repoRoot "admin-app"
$pythonExe = Join-Path $repoRoot "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Error "Python executable not found at $pythonExe. Create or activate the project venv first."
}

# Local dev: run from repo root using 'api.main:app' so package imports resolve.
# Port is fixed at 8000. $PORT is for Render (production) only — do not use here.
$backendArgs = @(
    "-NoExit"
    "-Command"
    "Set-Location '$backendCwd'; & '$pythonExe' -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log --log-level warning"
)

$frontendArgs = @(
    "-NoExit"
    "-Command"
    "Set-Location '$frontendCwd'; npm run dev -- --host 0.0.0.0 --port 5173 --logLevel error"
)

if ($NoNewWindows) {
    Write-Host "Starting backend in this terminal (quiet mode)..."
    Start-Job -Name "sfa-admin-frontend" -ScriptBlock {
        param($cwd)
        Set-Location $cwd
        npm run dev -- --host 0.0.0.0 --port 5173 --logLevel error
    } -ArgumentList $frontendCwd | Out-Null
    Set-Location $backendCwd
    & $pythonExe -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log --log-level warning
    exit $LASTEXITCODE
}

Write-Host "Launching quiet dev servers..."

Start-Job -Name "sfa-admin-backend" -ScriptBlock {
    param($cwd, $python)
    Set-Location $cwd
    & $python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log --log-level warning
} -ArgumentList $backendCwd, $pythonExe | Out-Null

Start-Job -Name "sfa-admin-frontend" -ScriptBlock {
    param($cwd)
    Set-Location $cwd
    npm run dev -- --host 0.0.0.0 --port 5173 --logLevel error
} -ArgumentList $frontendCwd | Out-Null

Write-Host "Done. Dev servers are running quietly in background jobs. Open the frontend manually if needed."
