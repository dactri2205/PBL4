using System.Collections.Concurrent;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using MiniVpn.Common;
using MiniVpn.Management;
using Microsoft.Extensions.Hosting;

namespace MiniVpn.Server.Runtime;

public interface ITunnelDevice
{
    Task StartAsync(CancellationToken cancellationToken);
    byte[]? Receive(CancellationToken cancellationToken);
    void Send(byte[] packet);
    Task StopAsync();
}
public sealed record TunnelOptions(IPAddress ListenAddress, int Port, X509Certificate2 Certificate);

public sealed class TunnelServer(TunnelOptions options, ITunnelDevice device, VpnManagementService management,
    IVpnSessionManager sessions, IVpnAuditStore audit, VpnRuntimeState state, ManagementOptions settings,
    IHostApplicationLifetime lifetime, IVpnWebRelay relay) : BackgroundService
{
    private readonly ConcurrentDictionary<long, Task> _connections = [];
    private readonly ConcurrentDictionary<long, TcpClient> _clients = [];
    private readonly TcpListener _listener = new(options.ListenAddress, options.Port);
    private long _sequence;
    private static OperationContext Context => new("vpn-runtime", Guid.NewGuid().ToString("N"));
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        Task? receive = null;
        var started = false;
        try
        {
            await device.StartAsync(linked.Token); started = true;
            _listener.Start();
            await relay.StartAsync(linked.Token);
            _ = relay.Completion.ContinueWith(_ => CancelLoops(), CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            state.Set("running"); state.WriteStatus(settings);
            audit.Write("service-started", "success", Context, "VPN listener and web relay ready");
            Console.WriteLine($"VPN listening {options.ListenAddress}:{options.Port}, web relay 10.8.0.1:8080");
            receive = Task.Run(() => ReceivePackets(linked.Token), CancellationToken.None);
            _ = receive.ContinueWith(_ => CancelLoops(), CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            while (!linked.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(linked.Token);
                var id = Interlocked.Increment(ref _sequence);
                _clients[id] = client;
                // Keep TLS handshakes bounded as well as authenticated sessions.
                if (_clients.Count > 512) { _clients.TryRemove(id, out _); client.Dispose(); continue; }
                var task = HandleClientAsync(client, linked.Token);
                _connections[id] = task;
                _ = task.ContinueWith(_ => { _connections.TryRemove(id, out var ignored); _clients.TryRemove(id, out var ignoredClient); },
                    CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
            if (!stoppingToken.IsCancellationRequested) throw new IOException("Tunnel receive loop stopped unexpectedly.");
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        catch (Exception)
        {
            state.Set("faulted");
            audit.Write("service-error", "failure", Context, "VPN runtime failed; consult local server diagnostics");
            Environment.ExitCode = 1;
            lifetime.StopApplication();
        }
        finally
        {
            var faulted = state.Status == "faulted";
            linked.Cancel(); _listener.Stop(); sessions.RevokeAll(faulted ? "server-fault" : "server-stop");
            foreach (var client in _clients.Values) client.Dispose();
            await relay.StopAsync();
            try { await Task.WhenAll(_connections.Values); } catch (Exception) { }
            if (receive is not null) { try { await receive; } catch (Exception) { } }
            if (started) { try { await device.StopAsync(); } catch (Exception) { faulted = true; } }
            state.Set(faulted ? "faulted" : "stopped"); state.WriteStatus(settings);
            audit.Write("service-stopped", faulted ? "failure" : "success", Context, faulted ? "Unexpected VPN failure" : "Intentional shutdown");
        }
        void CancelLoops() { try { linked.Cancel(); } catch (ObjectDisposedException) { } }
    }
    private void ReceivePackets(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var packet = device.Receive(ct);
            if (packet is null) return;
            if (packet.Length < 20) continue;
            var target = new IPAddress(packet.AsSpan(16, 4)).ToString();
            var session = sessions.FindByIp(target);
            if (session is not null && IpPolicy.IsAllowed(packet, IpPolicy.Ip("10.8.0.1"), IpPolicy.Ip(target), reply: true, webTarget: IpPolicy.Ip(IpPolicy.WebTargetAddress)))
                session.RunIfActive(() => session.Outgoing.Writer.TryWrite(packet));
        }
    }
    private async Task HandleClientAsync(TcpClient tcp, CancellationToken stop)
    {
        var remote = ((IPEndPoint)tcp.Client.RemoteEndPoint!).Address.ToString();
        VpnSession? session = null;
        var reason = "client-closed";
        using (tcp)
        {
            try
            {
                using var tls = new SslStream(tcp.GetStream());
                using var authTimeout = CancellationTokenSource.CreateLinkedTokenSource(stop);
                authTimeout.CancelAfter(TimeSpan.FromSeconds(30));
                await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions
                {
                    ServerCertificate = options.Certificate, EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                    ClientCertificateRequired = false
                }, authTimeout.Token);
                var frame = await Protocol.ReadAsync(tls, authTimeout.Token);
                if (frame.Type != FrameType.Login) throw new InvalidDataException("Expected login");
                var login = Protocol.Parse<Login>(frame.Data);
                session = await management.LoginAsync(login.User, login.Password, remote, tcp.Dispose, authTimeout.Token);
                if (session is null)
                {
                    await Protocol.WriteAsync(tls, FrameType.Denied, Protocol.Message("Invalid credentials"), authTimeout.Token); return;
                }
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(stop, session.Cancellation);
                await Protocol.WriteAsync(tls, FrameType.Welcome, Protocol.Json(new Welcome(session.VpnIp)), linked.Token);
                var send = SendAsync(tls, session, linked.Token);
                var read = ReadAsync(tls, session, linked.Token);
                try { await await Task.WhenAny(send, read); }
                finally
                {
                    linked.Cancel(); tcp.Dispose();
                    try { await Task.WhenAll(send, read); } catch (Exception) when (linked.IsCancellationRequested) { }
                }
            }
            catch (Exception ex) when (ex is IOException or AuthenticationException or InvalidDataException or
                OperationCanceledException or SocketException or ObjectDisposedException or System.Text.Json.JsonException or VpnException)
            {
                reason = ex is InvalidDataException ? "packet-or-protocol-rejected" : stop.IsCancellationRequested ? "server-stop" : "transport-closed";
                if (session is null) audit.Write("connection-error", "failure", Context, reason, sourceIp: remote);
            }
            catch (Exception)
            {
                reason = "service-error";
                audit.Write("service-error", "failure", Context, "Unexpected VPN client-handler failure",
                    session?.Username, session?.Id, remote, session?.VpnIp);
            }
            finally { if (session is not null) sessions.Complete(session, reason); }
        }
    }
    private static async Task SendAsync(SslStream tls, VpnSession session, CancellationToken ct)
    {
        await foreach (var packet in session.Outgoing.Reader.ReadAllAsync(ct))
        {
            await Protocol.WriteAsync(tls, FrameType.Packet, packet, ct);
            session.CountSent(packet.Length);
        }
    }
    private async Task ReadAsync(SslStream tls, VpnSession session, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var frame = await Protocol.ReadAsync(tls, ct);
            if (frame.Type != FrameType.Packet || !IpPolicy.IsAllowed(frame.Data, IpPolicy.Ip(session.VpnIp), IpPolicy.Ip("10.8.0.1"), reply: false, webTarget: IpPolicy.Ip(IpPolicy.WebTargetAddress)))
                throw new InvalidDataException("Packet rejected");
            if (!session.RunIfActive(() => { device.Send(frame.Data); session.CountReceived(frame.Data.Length); })) return;
        }
    }
}
