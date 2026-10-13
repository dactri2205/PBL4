param([string]$OutputPath = '.\certs\server.pfx')
$ErrorActionPreference = 'Stop'
$password = $env:MINIVPN_PFX_PASSWORD
if ([string]::IsNullOrEmpty($password)) { throw 'Set MINIVPN_PFX_PASSWORD in this PowerShell session first.' }
if (Test-Path -LiteralPath $OutputPath) { throw "Certificate already exists: $OutputPath" }
$resolved = [IO.Path]::GetFullPath($OutputPath)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolved)) | Out-Null
$rsa = [Security.Cryptography.RSA]::Create(3072)
$cert = $null
try {
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
        'CN=MiniVpnServer', $rsa,
        [Security.Cryptography.HashAlgorithmName]::SHA256,
        [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $san.AddDnsName('MiniVpnServer')
    $request.CertificateExtensions.Add($san.Build())
    $request.CertificateExtensions.Add(
        [Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
            [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true))
    $oids = [Security.Cryptography.OidCollection]::new()
    [void]$oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
    $request.CertificateExtensions.Add(
        [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $false))
    $cert = $request.CreateSelfSigned(
        [DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(30))
    $bytes = $cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password)
    [IO.File]::WriteAllBytes($resolved, $bytes)
    $fingerprint = [BitConverter]::ToString(
        ([Security.Cryptography.SHA256]::Create()).ComputeHash($cert.RawData)).Replace('-', '')
    Write-Output "Created: $resolved"
    Write-Output "SHA256 fingerprint: $fingerprint"
}
finally {
    if ($cert) { $cert.Dispose() }
    $rsa.Dispose()
}
