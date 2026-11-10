param(
    [Parameter(Mandatory = $true)][string]$ServerIp,
    [string]$ConfigurationPath,
    [string]$VpnCertificatePath,
    [ValidateRange(1024, 65535)][int]$VpnPort = 42424,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $ConfigurationPath) { $ConfigurationPath = Join-Path $projectRoot 'vpn-management.local.json' }
$configPath = (Resolve-Path -LiteralPath $ConfigurationPath).Path
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $VpnCertificatePath) { $VpnCertificatePath = 'certs\server.pfx' }
if (-not [IO.Path]::IsPathRooted($VpnCertificatePath)) {
    $VpnCertificatePath = Join-Path $projectRoot $VpnCertificatePath
}
$certificatePath = [IO.Path]::GetFullPath($VpnCertificatePath)
$accountsPath = Join-Path $projectRoot 'accounts.json'
foreach ($path in @($certificatePath, $accountsPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required file missing: $path" }
}
$webCertificatePath = $env:VpnWeb__HttpsCertificatePath
if (-not $webCertificatePath) { $webCertificatePath = $config.VpnWeb.HttpsCertificatePath }
if ($webCertificatePath) {
    if (-not [IO.Path]::IsPathRooted($webCertificatePath)) {
        $webCertificatePath = Join-Path $projectRoot $webCertificatePath
    }
    if (-not (Test-Path -LiteralPath $webCertificatePath -PathType Leaf)) {
        throw "Website certificate missing: $webCertificatePath"
    }
}
$ip = $null
if (-not [Net.IPAddress]::TryParse($ServerIp, [ref]$ip) -or
    $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
    [Net.IPAddress]::IsLoopback($ip) -or $ip.Equals([Net.IPAddress]::Any)) {
    throw 'ServerIp must be the LAN IPv4 address of laptop A. Check ipconfig.'
}
$assigned = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    Where-Object { $_.Address.Equals($ip) })
if ($assigned.Count -eq 0) { throw "LAN IPv4 $ServerIp is not assigned to this computer. Check ipconfig." }
$dotnet = (Get-Command dotnet -ErrorAction Stop).Source
$controlPort = 18181
if ($config.VpnManagement.ControlPort) { $controlPort = [int]$config.VpnManagement.ControlPort }
if ($env:VpnManagement__ControlPort) { $controlPort = [int]$env:VpnManagement__ControlPort }
$gatewayControlPort = 18181
if ($config.VpnAdmin.ControlPort) { $gatewayControlPort = [int]$config.VpnAdmin.ControlPort }
if ($env:VpnAdmin__ControlPort) { $gatewayControlPort = [int]$env:VpnAdmin__ControlPort }
if ($gatewayControlPort -ne $controlPort) { throw 'VpnAdmin.ControlPort and VpnManagement.ControlPort must match.' }
if (@($controlPort, 18080, 8080) -contains $VpnPort) { throw 'VPN port conflicts with another MiniVPN service.' }

Write-Host "Project: $projectRoot"
Write-Host "Config:  $configPath"
Write-Host "LAN IP:  $ServerIp"
if ($ValidateOnly) {
    Write-Host 'Validation passed. No services started; no passwords requested.'
    return
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell using Run as administrator, then run this script again.'
}
$listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
foreach ($port in @($VpnPort, $controlPort, 18080, 8080)) {
    if (@($listeners | Where-Object { $_.Port -eq $port }).Count -gt 0) {
        throw "TCP port $port is already in use. Close the existing MiniVPN service or resolve the port conflict before retrying."
    }
}
if ($env:MINIVPN_CONTROL_TOKEN -and $env:MINIVPN_CONTROL_TOKEN.Length -lt 32) {
    throw 'Existing MINIVPN_CONTROL_TOKEN must contain at least 32 characters.'
}

Push-Location -LiteralPath $projectRoot
try {
    & $dotnet build (Join-Path $projectRoot 'MiniVpn.sln') -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. No services started.' }
} finally { Pop-Location }
$driverPath = Join-Path $projectRoot 'src\MiniVpn.Server\bin\Release\net10.0-windows\wintun.dll'
if (-not (Test-Path -LiteralPath $driverPath -PathType Leaf)) {
    throw "Official AMD64 Wintun driver missing: $driverPath. See docs/02-vpn-checkpoint.md."
}

function Read-RequiredPassword([string]$Name, [string]$Prompt) {
    if ([Environment]::GetEnvironmentVariable($Name, 'Process')) { return }
    $secure = Read-Host $Prompt -AsSecureString
    try {
        $password = (New-Object Net.NetworkCredential('', $secure)).Password
        if (-not $password) { throw "$Name cannot be empty." }
        [Environment]::SetEnvironmentVariable($Name, $password, 'Process')
    } finally {
        $password = $null
        $secure.Dispose()
    }
}
Read-RequiredPassword 'MINIVPN_PFX_PASSWORD' "Password used to create $certificatePath"
$vpnCertificate = $null
try {
    try {
        $vpnCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
            $certificatePath, $env:MINIVPN_PFX_PASSWORD,
            [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    } catch { throw 'Cannot open VPN certificate. Check the PFX path and its original password.' }
    if (-not $vpnCertificate.HasPrivateKey) { throw 'VPN PFX must contain its private key.' }
    $nowUtc = [DateTime]::UtcNow
    if ($vpnCertificate.NotAfter.ToUniversalTime() -lt $nowUtc) {
        throw "VPN certificate expired at $($vpnCertificate.NotAfter.ToString('yyyy-MM-dd HH:mm:ss zzz')). Select a valid PFX with -VpnCertificatePath. No services started."
    }
    if ($vpnCertificate.NotBefore.ToUniversalTime() -gt $nowUtc) {
        throw 'VPN certificate is not valid yet. Check the computer clock and certificate dates. No services started.'
    }
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($sha256.ComputeHash($vpnCertificate.RawData)).Replace('-', '') }
    finally { $sha256.Dispose() }
    Write-Host "VPN certificate: $certificatePath"
    Write-Host "Valid until: $($vpnCertificate.NotAfter.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
    Write-Host "VPN SHA256 fingerprint (copy to client B): $fingerprint"
} finally { if ($vpnCertificate) { $vpnCertificate.Dispose() } }
if ($webCertificatePath) {
    Read-RequiredPassword 'MINIVPN_WEB_PFX_PASSWORD' 'Password used to create the website PFX certificate'
}
if (-not $env:MINIVPN_CONTROL_TOKEN) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $env:MINIVPN_CONTROL_TOKEN = [BitConverter]::ToString($bytes).Replace('-', '')
}
$env:MINIVPN_CONFIG = $configPath

# Encode command text to preserve paths with spaces. Secrets travel only via inherited environment.
function Quote-PowerShell([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
$rootLiteral = Quote-PowerShell $projectRoot
$dotnetLiteral = Quote-PowerShell $dotnet
$commands = @(
    "& $dotnetLiteral run --project './src/MiniVpn.Server' -c Release --no-build -- $ServerIp $(Quote-PowerShell $certificatePath) $(Quote-PowerShell $accountsPath) $VpnPort",
    "& $dotnetLiteral run --project './src/MiniVpn.InternalWeb' -c Release --no-build",
    "& $dotnetLiteral run --project './src/MiniVpn.Watchdog' -c Release --no-build"
)
foreach ($command in $commands) {
    $script = "Set-Location -LiteralPath $rootLiteral`r`n$command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    # Visible windows are intentional: each service displays its logs for the operator.
    Start-Process powershell.exe -WorkingDirectory $projectRoot -ArgumentList @(
        '-NoProfile', '-NoExit', '-EncodedCommand', $encoded
    ) | Out-Null
}
Write-Host 'Opened Server, InternalWeb and Watchdog windows. Check each window for startup errors.'
Write-Host 'The Node.js/PostgreSQL backend must also be running (webnew: docker compose up -d).'
if ($webCertificatePath) { Write-Host 'Laptop A website: https://127.0.0.1:18080/' }
else { Write-Host 'Laptop A website: http://127.0.0.1:18080/ (requires the documented Development HTTP configuration).' }
