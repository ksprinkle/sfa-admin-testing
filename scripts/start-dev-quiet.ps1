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
    "Set-Location '$frontendCwd'; npm run dev -- --host 0.0.0.0 --port 5173 --logLevel warn"
)

if ($NoNewWindows) {
    Write-Host "Starting backend in this terminal (quiet mode)..."
    Start-Process -FilePath "powershell.exe" -ArgumentList $frontendArgs | Out-Null
    Set-Location $backendCwd
    & $pythonExe -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload --no-access-log --log-level warning
    exit $LASTEXITCODE
}

Write-Host "Launching quiet dev servers..."
Write-Host "Backend: http://127.0.0.1:8000"
Write-Host "Frontend: http://127.0.0.1:5173"

Start-Process -FilePath "powershell.exe" -ArgumentList $backendArgs | Out-Null
Start-Process -FilePath "powershell.exe" -ArgumentList $frontendArgs | Out-Null

Write-Host "Done. Two new PowerShell windows were opened."
