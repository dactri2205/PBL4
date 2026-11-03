param([string]$OutputPath = '.\certs\web.pfx', [string]$VpnAddress = '10.8.0.1')
$ErrorActionPreference = 'Stop'
if (-not $env:MINIVPN_WEB_PFX_PASSWORD) { throw 'Set MINIVPN_WEB_PFX_PASSWORD before creating the website certificate.' }
$webCertificatePath = [IO.Path]::GetFullPath($OutputPath)
$webPublicPath = [IO.Path]::ChangeExtension($webCertificatePath, '.cer')
if ((Test-Path -LiteralPath $webCertificatePath) -or (Test-Path -LiteralPath $webPublicPath)) { throw 'Certificate output already exists. Choose another path or review the existing certificate.' }
$webVpnIp = [Net.IPAddress]::Parse($VpnAddress)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($webCertificatePath)) | Out-Null
$webRsa = [Security.Cryptography.RSA]::Create(3072)
$webCertificate = $null
try {
    $webRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=MiniVpn-Web', $webRsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $webSan = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $webSan.AddDnsName('localhost')
    $webSan.AddIpAddress([Net.IPAddress]::Loopback)
    $webSan.AddIpAddress($webVpnIp)
    $webRequest.CertificateExtensions.Add($webSan.Build())
    $webRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
    $webUsage = [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
    $webRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($webUsage, $true))
    $webOids = [Security.Cryptography.OidCollection]::new()
    [void]$webOids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
    $webRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($webOids, $false))
    $webCertificate = $webRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(90))
    [IO.File]::WriteAllBytes($webCertificatePath, $webCertificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $env:MINIVPN_WEB_PFX_PASSWORD))
    [IO.File]::WriteAllBytes($webPublicPath, $webCertificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    $webFingerprint = [BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash($webCertificate.RawData)).Replace('-', '')
    Write-Output "Website PFX: $webCertificatePath"
    Write-Output "Public certificate: $webPublicPath"
    Write-Output "SHA256: $webFingerprint"
} finally { if ($webCertificate) { $webCertificate.Dispose() }; $webRsa.Dispose() }
