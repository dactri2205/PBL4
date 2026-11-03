param([string]$ConfigurationPath)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($ConfigurationPath) { $env:MINIVPN_CONFIG = (Resolve-Path -LiteralPath $ConfigurationPath).Path }
if (-not $env:MINIVPN_CONTROL_TOKEN -or $env:MINIVPN_CONTROL_TOKEN.Length -lt 32) { throw 'Set MINIVPN_CONTROL_TOKEN (32+ characters) before starting watchdog.' }
Push-Location -LiteralPath $projectRoot
try { & dotnet run --project .\src\MiniVpn.Watchdog\MiniVpn.Watchdog.csproj -c Release }
finally { Pop-Location }
exit $LASTEXITCODE
