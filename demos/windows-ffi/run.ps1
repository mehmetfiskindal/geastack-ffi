$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")

if (-not (Test-Path node_modules)) {
    Write-Host "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path "dist/index.js")) {
    Write-Host "Building @geastack/ffi..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

node demos/windows-ffi/demo.mjs
exit $LASTEXITCODE
