param([ValidateSet('Debug','Release')][string]$Configuration = 'Release')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $repoRoot 'src\MiniVpn.Desktop\MiniVpn.Desktop.csproj'
$dll = Join-Path $repoRoot "src\MiniVpn.Desktop\bin\$Configuration\net10.0-windows\MiniVpn.Desktop.dll"
& dotnet build $project -c $Configuration
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Opening MiniVpn.Desktop ($Configuration)..."
Write-Host "If Windows blocks the program, the error will appear below."
& dotnet $dll
$code = $LASTEXITCODE
if ($code -ne 0) {
    Write-Host "MiniVpn.Desktop stopped with exit code $code."
    Write-Host 'If the error contains 0x800711C7, Windows Application Control blocked the new assembly.'
    Write-Host 'Check Windows Security > App & browser control > Smart App Control, and CodeIntegrity event 3077.'
    Write-Host 'Smart App Control has no per-app exception; use a trusted signed build or a development machine that permits local builds.'
}
exit $code
