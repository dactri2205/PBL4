using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using MiniVpn.Common;
using MiniVpn.Wintun;

namespace MiniVpn.ClientCore;

public sealed record VpnOptions(string Server, int Port, string User, string Password, string Fingerprint);
public sealed record VpnState(string Message, string? Address = null);

public static class VpnConnection
{
    public static async Task RunAsync(VpnOptions options, Action<VpnState> report, CancellationToken stop)
    {
        if (!IPAddress.TryParse(options.Server, out var serverIp) || serverIp.AddressFamily != AddressFamily.InterNetwork)
            throw new ArgumentException("Địa chỉ máy chủ phải là IPv4 LAN.");
        if (options.Port is < 1024 or > 65535) throw new ArgumentException("Cổng VPN không hợp lệ.");
        if (options.User.Length is < 1 or > 32 || options.User.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_'))
            throw new ArgumentException("Tên tài khoản chỉ gồm 1–32 chữ ASCII, số hoặc dấu gạch dưới.");
        if (string.IsNullOrEmpty(options.Password)) throw new ArgumentException("Cần nhập mật khẩu VPN.");
        string pin = options.Fingerprint.Replace(":", "").Replace(" ", "").ToUpperInvariant();
        if (pin.Length != 64 || !pin.All(Uri.IsHexDigit)) throw new ArgumentException("Fingerprint SHA256 phải có 64 ký tự hex.");
        byte[] pinnedHash = Convert.FromHexString(pin);

        report(new("Đang kết nối TLS…"));
        using var tcp = new TcpClient(AddressFamily.InterNetwork);
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop))
        {
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            try { await tcp.ConnectAsync(serverIp, options.Port, timeout.Token); }
            catch (OperationCanceledException) when (!stop.IsCancellationRequested) { throw new TimeoutException("Máy chủ VPN không phản hồi trong 15 giây."); }
        }
        using var tls = new SslStream(tcp.GetStream(), false, (_, cert, _, _) =>
        {
            if (cert is null) return false;
            using var x = new X509Certificate2(cert);
            return x.NotBefore <= DateTime.UtcNow && x.NotAfter >= DateTime.UtcNow &&
                CryptographicOperations.FixedTimeEquals(pinnedHash, x.GetCertHash(HashAlgorithmName.SHA256));
        });
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop))
        {
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            try
            {
                await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions
                {
                    TargetHost = "MiniVpnServer", EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                    CertificateRevocationCheckMode = X509RevocationMode.NoCheck
                }, timeout.Token);
            }
            catch (OperationCanceledException) when (!stop.IsCancellationRequested) { throw new TimeoutException("Bắt tay TLS không hoàn tất trong 15 giây."); }
        }
        report(new("TLS đã xác thực; đang đăng nhập VPN…"));
        await Protocol.WriteAsync(tls, FrameType.Login, Protocol.Json(new Login(options.User, options.Password)), stop);
        Frame response = await Protocol.ReadAsync(tls, stop);
        if (response.Type == FrameType.Denied) throw new UnauthorizedAccessException("Tài khoản hoặc mật khẩu VPN không đúng.");
        if (response.Type != FrameType.Welcome) throw new InvalidDataException("Máy chủ trả lời sai giao thức.");
        string address = Protocol.Parse<Welcome>(response.Data).Address;
        if (!IPAddress.TryParse(address, out var vpnIp) || vpnIp.GetAddressBytes() is not [10, 8, 0, >= 2 and <= 254])
            throw new InvalidDataException("Máy chủ cấp địa chỉ VPN không hợp lệ.");

        report(new("Đã đăng nhập; đang tạo Wintun và route…"));
        using var tun = new Tun("MiniVpn-Client-" + options.User);
        try { await NetConfig.ConfigureAsync(tun.InterfaceIndex, address, server: false); }
        catch { try { await NetConfig.CleanupAsync(tun.InterfaceIndex, address); } catch { } throw; }
        try
        {
            report(new($"Đã kết nối — {address}", address));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(stop);
            Task uplink = Task.Run(async () =>
            {
                while (!linked.IsCancellationRequested)
                {
                    byte[]? packet = tun.Receive(linked.Token);
                    if (packet is null) break;
                    if (IpPolicy.IsAllowed(packet, IpPolicy.Ip(address), IpPolicy.Ip("10.8.0.1"), reply: false))
                        await Protocol.WriteAsync(tls, FrameType.Packet, packet, linked.Token);
                }
            }, linked.Token);
            Task downlink = Task.Run(async () =>
            {
                while (!linked.IsCancellationRequested)
                {
                    Frame frame = await Protocol.ReadAsync(tls, linked.Token);
                    if (frame.Type != FrameType.Packet || !IpPolicy.IsAllowed(frame.Data, IpPolicy.Ip("10.8.0.1"), IpPolicy.Ip(address), reply: true))
                        throw new InvalidDataException("Gói tin từ máy chủ bị từ chối.");
                    tun.Send(frame.Data);
                }
            }, linked.Token);
            try { await await Task.WhenAny(uplink, downlink); }
            finally
            {
                linked.Cancel();
                try { await uplink; } catch (OperationCanceledException) { }
                try { await downlink; } catch (OperationCanceledException) { }
            }
        }
        finally
        {
            report(new("Đang xóa route và địa chỉ VPN…"));
            await NetConfig.CleanupAsync(tun.InterfaceIndex, address);
        }
    }
}
