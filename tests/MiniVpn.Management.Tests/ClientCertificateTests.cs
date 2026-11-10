using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using MiniVpn.ClientCore;
using MiniVpn.Common;

internal static class ClientCertificateTests
{
    public static async Task RunAsync()
    {
        var now = DateTimeOffset.UtcNow;
        await CheckAsync(now.AddMinutes(-5), now.AddDays(1), null);
        await CheckAsync(now.AddDays(-2), now.AddDays(-1), "hết hạn");
        await CheckAsync(now.AddDays(1), now.AddDays(2), "chưa có hiệu lực");
        await CheckAsync(now.AddMinutes(-5), now.AddDays(1), "Fingerprint", wrongPin: true);
    }

    private static async Task CheckAsync(DateTimeOffset from, DateTimeOffset until, string? rejection, bool wrongPin = false)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=MiniVpnServer", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var generated = request.CreateSelfSigned(from, until);
        using var certificate = X509CertificateLoader.LoadPkcs12(generated.Export(X509ContentType.Pfx, "test-only"), "test-only", X509KeyStorageFlags.UserKeySet);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        try
        {
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var server = Task.Run(async () =>
            {
                using var tcp = await listener.AcceptTcpClientAsync(timeout.Token);
                using var tls = new SslStream(tcp.GetStream());
                try
                {
                    await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                    {
                        ServerCertificate = certificate,
                        EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13
                    }, timeout.Token);
                    var login = await Protocol.ReadAsync(tls, timeout.Token);
                    if (login.Type != FrameType.Login) throw new Exception("Expected VPN login after successful TLS");
                    // Stop before Wintun: a denied login proves that the real client accepted TLS.
                    await Protocol.WriteAsync(tls, FrameType.Denied, Protocol.Message("test only"), timeout.Token);
                }
                catch (Exception ex) when (rejection is not null && ex is AuthenticationException or IOException) { }
            }, timeout.Token);
            var pin = wrongPin ? new string('0', 64) : Convert.ToHexString(certificate.GetCertHash(HashAlgorithmName.SHA256));
            try
            {
                await VpnConnection.RunAsync(new("127.0.0.1", port, "tls_test", "test-only", pin), _ => { }, timeout.Token);
                throw new Exception("Expected login denial or certificate rejection");
            }
            catch (UnauthorizedAccessException) when (rejection is null) { }
            catch (AuthenticationException ex) when (rejection is not null && ex.Message.Contains(rejection, StringComparison.Ordinal)) { }
            finally { await server; }
        }
        finally { listener.Stop(); }
    }
}
