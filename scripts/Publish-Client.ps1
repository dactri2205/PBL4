param(
    [string]$WintunDllPath,
    [string]$WintunLicensePath,
    [string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$clientRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
if (-not $WintunDllPath) { $WintunDllPath = Join-Path $clientRepo '.download\wintun-0.14.1\wintun\bin\amd64\wintun.dll' }
$WintunDllPath = (Resolve-Path -LiteralPath $WintunDllPath).ProviderPath
if (-not $WintunLicensePath) {
    $wintunFolder = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $WintunDllPath))
    $WintunLicensePath = Join-Path $wintunFolder 'LICENSE.txt'
}
$WintunLicensePath = (Resolve-Path -LiteralPath $WintunLicensePath).ProviderPath
$driverSignature = Get-AuthenticodeSignature -LiteralPath $WintunDllPath
if ($driverSignature.Status -ne 'Valid' -or $driverSignature.SignerCertificate.Subject -notmatch 'WireGuard LLC') { throw 'Use the original, validly signed Wintun DLL from the official distribution.' }
$driverBytes = [IO.File]::ReadAllBytes($WintunDllPath)
$peOffset = [BitConverter]::ToInt32($driverBytes, 0x3c)
if ([BitConverter]::ToUInt16($driverBytes, $peOffset + 4) -ne 0x8664) { throw 'This package targets Windows x64 and requires the AMD64 Wintun DLL.' }
$driverHash = (Get-FileHash -LiteralPath $WintunDllPath -Algorithm SHA256).Hash
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $clientRepo 'artifacts\client-win-x64' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$clientStage = Join-Path $clientRepo ('.dotnet\client-publish-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($clientStage) | Out-Null
$env:DOTNET_CLI_HOME = Join-Path $clientRepo '.dotnet'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$publishArguments = @(
    'publish', (Join-Path $clientRepo 'src\MiniVpn.Desktop\MiniVpn.Desktop.csproj'),
    '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '--nologo', '-o', $clientStage,
    '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true',
    '-p:EnableCompressionInSingleFile=true', '-p:PublishTrimmed=false', '-p:PublishReadyToRun=false',
    '-p:DebugType=None', '-p:DebugSymbols=false', '-p:CopyOutputSymbolsToPublishDirectory=false',
    "-p:WintunDllPath=$WintunDllPath", "-p:WintunLicensePath=$WintunLicensePath"
)
& dotnet @publishArguments
if ($LASTEXITCODE -ne 0) { throw 'Client publish failed.' }
$stageFiles = @(Get-ChildItem -LiteralPath $clientStage -File -Recurse)
if ($stageFiles.Count -ne 1 -or $stageFiles[0].Name -ne 'MiniVpn.Desktop.exe') { throw 'Expected exactly one EXE, without loose DLL/runtime/config files.' }
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$clientExe = Join-Path $OutputDirectory 'MiniVpn.Desktop.exe'
Copy-Item -LiteralPath $stageFiles[0].FullName -Destination $clientExe -Force

# Launch diagnostics from an empty working directory, with installed-runtime discovery
# disabled. This checks the actual delivered file without invoking UAC or creating Wintun.
$diagnosticDirectory = Join-Path $clientRepo ('.dotnet\client-check-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($diagnosticDirectory) | Out-Null
$diagnostic = [Diagnostics.ProcessStartInfo]::new($clientExe, '--self-test')
$diagnostic.UseShellExecute = $false
$diagnostic.CreateNoWindow = $true
$diagnostic.WorkingDirectory = $diagnosticDirectory
$diagnostic.RedirectStandardOutput = $true
$diagnostic.RedirectStandardError = $true
$diagnostic.EnvironmentVariables['DOTNET_ROOT'] = Join-Path $diagnosticDirectory 'no-installed-runtime'
$diagnostic.EnvironmentVariables['DOTNET_ROOT_X64'] = Join-Path $diagnosticDirectory 'no-installed-runtime'
$diagnostic.EnvironmentVariables['DOTNET_MULTILEVEL_LOOKUP'] = '0'
$diagnostic.EnvironmentVariables['DOTNET_BUNDLE_EXTRACT_BASE_DIR'] = Join-Path $diagnosticDirectory 'bundle'
$check = [Diagnostics.Process]::Start($diagnostic)
$checkOutput = $check.StandardOutput.ReadToEndAsync()
$checkError = $check.StandardError.ReadToEndAsync()
if (-not $check.WaitForExit(60000)) { $check.Kill(); throw 'Packaged client self-test timed out.' }
$checkText = $checkOutput.GetAwaiter().GetResult()
$checkFailure = $checkError.GetAwaiter().GetResult()
if ($check.ExitCode -ne 0) { throw "Packaged EXE check failed: $checkText $checkFailure" }
$result = $checkText.Trim() | ConvertFrom-Json
if (-not $result.success -or $result.wintunSha256 -ne $driverHash -or -not $result.licenseIncluded -or -not $result.formInitialized) { throw 'Packaged EXE or embedded Wintun verification failed.' }
$check.Dispose()
$exeInfo = Get-Item -LiteralPath $clientExe
[pscustomobject]@{
    Executable = $clientExe
    Runtime = 'Windows x64, self-contained, single file'
    SizeMiB = [math]::Round($exeInfo.Length / 1MB, 1)
    SHA256 = (Get-FileHash -LiteralPath $clientExe -Algorithm SHA256).Hash
    BundledDriverVerified = $true
    LicenseEmbedded = $true
    IsolatedLaunchPassed = $true
    TunnelTested = $false
} | ConvertTo-Json
