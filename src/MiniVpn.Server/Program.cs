using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using System.Security.Principal;
using MiniVpn.Common;
using MiniVpn.Wintun;

if (args.Length >= 3 && args[0] == "add-user")
{
    string path = args[1], user = args[2];
    if (user.Length is < 1 or > 32 || user.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_')) throw new ArgumentException("Username: 1-32 ASCII letters, digits or underscore");
    Console.Write("VPN password: "); string password = ReadSecret();
    if (password.Length < 12) throw new ArgumentException("Use at least 12 characters");
    var users = File.Exists(path) ? JsonSerializer.Deserialize<Dictionary<string, PasswordRecord>>(File.ReadAllText(path))! : new();
    users[user] = Passwords.Create(password);
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
    File.WriteAllText(path, JsonSerializer.Serialize(users, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine($"Account {user} stored (PBKDF2-SHA256)");
    return;
}
if (args.Length != 4)
{
    Console.WriteLine("Usage: MiniVpn.Server <LAN IPv4> <server.pfx> <accounts.json> <VPN port>\n       MiniVpn.Server add-user <accounts.json> <username>");
    return;
}
string pfxPassword = Environment.GetEnvironmentVariable("MINIVPN_PFX_PASSWORD") ?? throw new InvalidOperationException("Set MINIVPN_PFX_PASSWORD");
if (!IPAddress.TryParse(args[0], out var lanAddress) || lanAddress.AddressFamily != AddressFamily.InterNetwork || lanAddress.Equals(IPAddress.Any) || lanAddress.Equals(IPAddress.Loopback))
    throw new ArgumentException("Specify the actual LAN IPv4 address, not 0.0.0.0 or loopback");
if (!int.TryParse(args[3], out int vpnPort) || vpnPort is < 1024 or > 65535) throw new ArgumentException("Invalid VPN port");
if (!NetworkInterface.GetAllNetworkInterfaces().SelectMany(n => n.GetIPProperties().UnicastAddresses).Any(a => a.Address.Equals(lanAddress)))
{
    Console.Error.WriteLine($"IP {lanAddress} is not assigned to this computer. Check the current Wi-Fi/LAN IPv4 with ipconfig.");
    Environment.ExitCode = 1; return;
}
if (!File.Exists(args[1]))
{
    Console.Error.WriteLine($"Certificate not found: {args[1]}. Create it with scripts/Make-DemoCertificate.ps1.");
    Environment.ExitCode = 1; return;
}
if (!File.Exists(args[2]))
{
    Console.Error.WriteLine($"VPN accounts not found: {args[2]}. Run 'MiniVpn.Server add-user {args[2]} alice' and repeat for bob.");
    Environment.ExitCode = 1; return;
}
if (!File.Exists(Path.Combine(AppContext.BaseDirectory, "wintun.dll")))
{
    Console.Error.WriteLine("wintun.dll not found next to MiniVpn.Server.exe. Copy the official AMD64 Wintun DLL into the build output directory.");
    Environment.ExitCode = 1; return;
}
if (!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
{
    Console.Error.WriteLine("Wintun requires Administrator. Open PowerShell with 'Run as administrator' and start the server again.");
    Environment.ExitCode = 1; return;
}
var certificate = X509CertificateLoader.LoadPkcs12FromFile(args[1], pfxPassword, X509KeyStorageFlags.EphemeralKeySet);
var accounts = JsonSerializer.Deserialize<Dictionary<string, PasswordRecord>>(File.ReadAllText(args[2])) ?? throw new InvalidDataException("accounts.json empty");
using var stop = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
using var tun = new Tun("MiniVpn-Server");
try { await NetConfig.ConfigureAsync(tun.InterfaceIndex, "10.8.0.1", server: true); }
catch { try { await NetConfig.CleanupAsync(tun.InterfaceIndex, "10.8.0.1"); } catch { } throw; }
Console.WriteLine($"Wintun ifIndex={tun.InterfaceIndex} 10.8.0.1/24");
var leases = new LeasePool();
var sessions = new ConcurrentDictionary<string, ServerSession>();
var limiter = new ConcurrentDictionary<string, (int Count, DateTime Until)>();
var listener = new TcpListener(lanAddress, vpnPort);
using var relay = new WebRelay(stop.Token, ip => sessions.ContainsKey(ip));
try
{
    listener.Start();
    await relay.StartAsync(stop.Token);
}
catch
{
    listener.Stop();
    try { await NetConfig.CleanupAsync(tun.InterfaceIndex, "10.8.0.1"); }
    catch (Exception cleanupError) { Console.Error.WriteLine("Network cleanup failed: " + cleanupError.Message); }
    throw;
}
Console.WriteLine($"VPN listening {args[0]}:{args[3]}, web relay 10.8.0.1:8080");
Task tunTask = Task.Run(() =>
{
    while (!stop.IsCancellationRequested)
    {
        byte[]? packet = tun.Receive(stop.Token);
        if (packet == null) break;
        if (packet.Length < 20) continue;
        string target = new IPAddress(packet.AsSpan(16, 4)).ToString();
        if (sessions.TryGetValue(target, out var session) && IpPolicy.IsAllowed(packet, IpPolicy.Ip("10.8.0.1"), IpPolicy.Ip(target), reply: true))
            session.Outgoing.Writer.TryWrite(packet);
    }
}, stop.Token);
_ = tunTask.ContinueWith(t => { if (t.IsFaulted) stop.Cancel(); }, TaskScheduler.Default);
try
{
    while (!stop.IsCancellationRequested)
    {
        TcpClient tcp = await listener.AcceptTcpClientAsync(stop.Token);
        _ = Task.Run(async () =>
        {
            string remote = ((IPEndPoint)tcp.Client.RemoteEndPoint!).Address.ToString();
            using (tcp)
            {
                try
                {
                    if (limiter.TryGetValue(remote, out var state) && state.Count >= 6 && state.Until > DateTime.UtcNow) return;
                    using var tls = new SslStream(tcp.GetStream());
                    using var handshakeTimeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                    handshakeTimeout.CancelAfter(TimeSpan.FromSeconds(15));
                    await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                    {
                        ServerCertificate = certificate, EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                        ClientCertificateRequired = false
                    }, handshakeTimeout.Token);
                    using var authTimeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                    authTimeout.CancelAfter(TimeSpan.FromSeconds(30));
                    Frame frame = await Protocol.ReadAsync(tls, authTimeout.Token);
                    if (frame.Type != FrameType.Login || frame.Data.Length > 512) throw new InvalidDataException("Expected login");
                    var login = Protocol.Parse<Login>(frame.Data);
                    if (login.User is null || login.Password is null || login.User.Length > 32 || login.Password.Length > 256 ||
                        !accounts.TryGetValue(login.User, out var record) || !Passwords.Verify(login.Password, record))
                    {
                        limiter.AddOrUpdate(remote, (1, DateTime.UtcNow.AddMinutes(5)), (_, old) => old.Until < DateTime.UtcNow ? (1, DateTime.UtcNow.AddMinutes(5)) : (old.Count + 1, old.Until));
                        await Protocol.WriteAsync(tls, FrameType.Denied, Protocol.Message("Invalid credentials"), stop.Token);
                        Log("login-denied", remote, login.User, null);
                        return;
                    }
                    string? address = leases.Acquire();
                    if (address == null) { await Protocol.WriteAsync(tls, FrameType.Denied, Protocol.Message("No VPN addresses available"), stop.Token); return; }
                    limiter.TryRemove(remote, out _);
                    var session = new ServerSession(login.User, address);
                    sessions[address] = session;
                    Log("connected", remote, login.User, address);
                    try
                    {
                        await Protocol.WriteAsync(tls, FrameType.Welcome, Protocol.Json(new Welcome(address)), stop.Token);
                        using var linked = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                        Task send = Task.Run(async () =>
                        {
                            await foreach (byte[] packet in session.Outgoing.Reader.ReadAllAsync(linked.Token))
                                await Protocol.WriteAsync(tls, FrameType.Packet, packet, linked.Token);
                        }, linked.Token);
                        try
                        {
                            while (!linked.IsCancellationRequested)
                            {
                                Frame f = await Protocol.ReadAsync(tls, linked.Token);
                                if (f.Type != FrameType.Packet || !IpPolicy.IsAllowed(f.Data, IpPolicy.Ip(address), IpPolicy.Ip("10.8.0.1"), reply: false))
                                    throw new InvalidDataException("Packet rejected by VPN policy");
                                tun.Send(f.Data);
                            }
                        }
                        finally { linked.Cancel(); try { await send; } catch (OperationCanceledException) { } }
                    }
                    finally { sessions.TryRemove(address, out _); leases.Release(address); Log("disconnected", remote, login.User, address); }
                }
                catch (Exception ex) when (ex is IOException or AuthenticationException or InvalidDataException or OperationCanceledException or SocketException or System.ComponentModel.Win32Exception)
                { Log("closed", remote, null, null, ex.GetType().Name + ": " + ex.Message); }
            }
        });
    }
}
catch (OperationCanceledException) { }
finally
{
    stop.Cancel(); listener.Stop();
    try { await tunTask; } catch (Exception ex) { Console.Error.WriteLine("Wintun stopped: " + ex.Message); }
    await NetConfig.CleanupAsync(tun.InterfaceIndex, "10.8.0.1");
}

static void Log(string state, string remote, string? user, string? vpn, string? error = null) =>
    Console.WriteLine(JsonSerializer.Serialize(new { time = DateTimeOffset.UtcNow, state, remote, user, vpn, error }));
static string ReadSecret()
{
    var value = new StringBuilder();
    ConsoleKeyInfo key;
    while ((key = Console.ReadKey(true)).Key != ConsoleKey.Enter)
    { if (key.Key == ConsoleKey.Backspace && value.Length > 0) value.Length--; else if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar); }
    Console.WriteLine(); return value.ToString();
}

sealed class ServerSession(string user, string address)
{
    public string User { get; } = user;
    public string Address { get; } = address;
    public Channel<byte[]> Outgoing { get; } = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });
}
sealed class LeasePool
{
    private readonly HashSet<string> _used = new();
    public string? Acquire() { lock (_used) { for (int n = 2; n < 255; n++) { string ip = $"10.8.0.{n}"; if (_used.Add(ip)) return ip; } return null; } }
    public void Release(string ip) { lock (_used) _used.Remove(ip); }
}

sealed class WebRelay(CancellationToken stop, Func<string, bool> isActive) : IDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Parse("10.8.0.1"), 8080);
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        // Windows may still be activating the new Wintun address after New-NetIPAddress returns.
        for (int attempt = 0; ; attempt++)
        {
            try { _listener.Start(); _ = Run(); return; }
            catch (SocketException ex) when (ex.SocketErrorCode == SocketError.AddressNotAvailable && attempt < 39)
            { await Task.Delay(250, cancellationToken); }
        }
    }
    private async Task Run()
    {
        try
        {
            while (!stop.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(stop);
                _ = Task.Run(async () =>
                {
                    using (client)
                    {
                        var remote = ((IPEndPoint)client.Client.RemoteEndPoint!).Address;
                        if (remote.GetAddressBytes() is not [10, 8, 0, >= 2 and <= 254] || !isActive(remote.ToString())) return;
                        using var backend = new TcpClient(AddressFamily.InterNetwork);
                        try
                        {
                            await backend.ConnectAsync(IPAddress.Loopback, 18080, stop);
                            using var c = client.GetStream(); using var b = backend.GetStream();
                            Task a = c.CopyToAsync(b, stop), z = b.CopyToAsync(c, stop);
                            await Task.WhenAny(a, z);
                        }
                        catch (Exception ex) when (ex is SocketException or IOException or OperationCanceledException) { }
                    }
                });
            }
        }
        catch (OperationCanceledException) { }
    }
    public void Dispose() => _listener.Stop();
}
