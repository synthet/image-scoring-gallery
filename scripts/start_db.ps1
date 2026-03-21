$processName = "firebird"

# Resolve Python backend root: env override, then sibling folders (image-scoring-backend | image-scoring).
$galleryRoot = Split-Path -Parent $PSScriptRoot
$candidates = @()
if ($env:IMAGE_SCORING_ROOT) {
    $envRoot = $env:IMAGE_SCORING_ROOT -replace '[/\\]+$', ''
    $candidates += (Join-Path $envRoot "run_firebird.bat")
}
$candidates += @(
    (Join-Path $galleryRoot "..\image-scoring-backend\run_firebird.bat"),
    (Join-Path $galleryRoot "..\image-scoring\run_firebird.bat")
)

$firebirdPath = $null
foreach ($p in $candidates) {
    $resolved = [System.IO.Path]::GetFullPath($p)
    if (Test-Path -LiteralPath $resolved) {
        $firebirdPath = $resolved
        break
    }
}

if (-not $firebirdPath) {
    Write-Error @"
Could not find run_firebird.bat in the Python backend repo.
Tried:
$(($candidates | ForEach-Object { "  - $_" }) -join "`n")
Set IMAGE_SCORING_ROOT to your backend clone root (folder containing run_firebird.bat), or place the backend next to this repo as image-scoring-backend or image-scoring.
"@
    exit 1
}

Write-Host "Using Firebird launcher: $firebirdPath"

$running = Get-Process -Name $processName -ErrorAction SilentlyContinue

if ($running) {
    Write-Host "Firebird server is already running. Waiting for process..."
    $running | Wait-Process
} else {
    Write-Host "Starting Firebird server..."
    & $firebirdPath
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
