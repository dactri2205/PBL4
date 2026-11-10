param(
    [string]$ServerIp = "192.168.238.1"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot "server.env"
$project = Join-Path $repoRoot "src\MiniVpn.Server\MiniVpn.Server.csproj"
$pfx = Join-Path $repoRoot "certs\server.pfx"
$accounts = Join-Path $repoRoot "accounts.json"
$makeCertificate = Join-Path $PSScriptRoot "Make-DemoCertificate.ps1"

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Missing server.env. Copy server.env.example to server.env and set MINIVPN_PFX_PASSWORD."
}

$entries = @(Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*MINIVPN_PFX_PASSWORD=' })
if ($entries.Count -ne 1) {
    throw "server.env must contain exactly one MINIVPN_PFX_PASSWORD=... entry."
}

$password = $entries[0] -replace '^\s*MINIVPN_PFX_PASSWORD=', ''
if ([string]::IsNullOrEmpty($password)) {
    throw "MINIVPN_PFX_PASSWORD is empty in server.env."
}
if (-not (Test-Path -LiteralPath $project -PathType Leaf)) {
    throw "Missing VPN server project: $project"
}

$env:MINIVPN_PFX_PASSWORD = $password
$password = $null
$exitCode = 1
try {
    if (-not (Test-Path -LiteralPath $accounts -PathType Leaf)) {
        $username = Read-Host "No accounts.json found. Enter the first VPN username"
        if ($username -notmatch '^[A-Za-z0-9_]{1,32}$') {
            throw "VPN username must be 1-32 ASCII letters, digits, or underscores."
        }
        Write-Host "Create a VPN password of at least 12 characters. Password input is hidden."
        dotnet run --project $project -c Release -- add-user $accounts $username
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $accounts -PathType Leaf)) {
            throw "Could not create VPN account file."
        }
    }

    if (-not (Test-Path -LiteralPath $pfx -PathType Leaf)) {
        if (-not (Test-Path -LiteralPath $makeCertificate -PathType Leaf)) {
            throw "Missing certificate generator: $makeCertificate"
        }
        Write-Host "No server certificate found; generating certs\server.pfx..."
        & $makeCertificate -OutputPath $pfx
    }

    if (-not (Test-Path -LiteralPath $pfx -PathType Leaf)) {
        throw "Certificate generation did not create: $pfx"
    }

    dotnet run --project $project -c Release -- $ServerIp $pfx $accounts 42424
    $exitCode = $LASTEXITCODE
}
finally {
    Remove-Item Env:\MINIVPN_PFX_PASSWORD -ErrorAction SilentlyContinue
}

exit $exitCode