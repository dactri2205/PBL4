param(
    [Parameter(Mandatory=$true)][System.Net.IPAddress]$LanAddress,
    [string]$CertificatePath = '.\certs\server.pfx',
    [string]$AccountsPath = '.\accounts.json',
    [ValidateRange(1024,65535)][int]$VpnPort = 42424
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this recovery script in Administrator PowerShell on the server.' }
if (-not $env:MINIVPN_PFX_PASSWORD) { throw 'Set MINIVPN_PFX_PASSWORD.' }
Push-Location -LiteralPath $projectRoot
try {
    $adapter = Get-NetAdapter -Name 'MiniVpn-Server' -ErrorAction SilentlyContinue
    $owner = Get-NetTCPConnection -LocalAddress $LanAddress.IPAddressToString -LocalPort $VpnPort -State Listen -ErrorAction SilentlyContinue
    if ($owner) { throw 'VPN port is already listening. Stop the running server intentionally before recovery.' }
    # Limit recovery to the named server adapter and the exact VPN address. Never execute
    # commands/paths received from the web, or remove unrelated interfaces/routes.
    if ($adapter) {
        Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress '10.8.0.1' -ErrorAction SilentlyContinue |
            Remove-NetIPAddress -Confirm:$false -ErrorAction Stop
    }
    & dotnet run --project .\src\MiniVpn.Server\MiniVpn.Server.csproj -c Release -- $LanAddress.IPAddressToString $CertificatePath $AccountsPath $VpnPort
} finally { Pop-Location }
exit $LASTEXITCODE
