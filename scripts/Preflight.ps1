param([string]$WintunDll = '.\wintun.dll')
$ErrorActionPreference = 'Continue'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$ips = try { @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' } | Select-Object InterfaceAlias,IPAddress,PrefixLength) } catch { @("Get-NetIPAddress: $($_.Exception.Message)") }
$docker = Get-Command docker -ErrorAction SilentlyContinue
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
[pscustomobject]@{
  Computer = $env:COMPUTERNAME
  Windows = [Environment]::OSVersion.VersionString
  Administrator = $admin
  DotNet = if ($dotnet) { (& dotnet --version) } else { 'not found' }
  Docker = if ($docker) { (& docker version --format '{{.Client.Version}}' 2>&1 | Out-String).Trim() } else { 'not found' }
  WintunDll = (Test-Path -LiteralPath $WintunDll)
  IPv4 = $ips
} | ConvertTo-Json -Depth 5
