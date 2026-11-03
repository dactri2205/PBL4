using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using MiniVpn.Management;

namespace MiniVpn.Server.Runtime;

public interface IVpnWebRelay
{
    Task Completion { get; }
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync();
}
public sealed class WebRelay(IVpnSessionManager sessions) : IVpnWebRelay, IDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Parse("10.8.0.1"), 8080);
    private readonly CancellationTokenSource _stop = new();
    private readonly ConcurrentDictionary<long, Task> _tasks = [];
    private Task? _accept;
    public Task Completion => _accept ?? Task.CompletedTask;
    private long _sequence;
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { _listener.Start(); _accept = RunAsync(); return; }
            catch (SocketException ex) when (ex.SocketErrorCode == SocketError.AddressNotAvailable && attempt < 39)
            { await Task.Delay(250, cancellationToken); }
        }
    }
    private async Task RunAsync()
    {
        try
        {
            while (!_stop.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(_stop.Token);
                var id = Interlocked.Increment(ref _sequence);
                var task = RelayAsync(client);
                _tasks[id] = task;
                _ = task.ContinueWith(_ => _tasks.TryRemove(id, out var ignored), CancellationToken.None,
                    TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
        }
        catch (Exception ex) when (_stop.IsCancellationRequested && (ex is OperationCanceledException or SocketException or ObjectDisposedException)) { }
    }
    private async Task RelayAsync(TcpClient client)
    {
        using (client)
        using (var backend = new TcpClient(AddressFamily.InterNetwork))
        {
            var ip = ((IPEndPoint)client.Client.RemoteEndPoint!).Address;
            var session = ip.GetAddressBytes() is [10, 8, 0, >= 2 and <= 254] ? sessions.FindByIp(ip.ToString()) : null;
            if (session is null || !session.AttachRelay(client, backend)) return;
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token, session.Cancellation);
            try
            {
                using (var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(linked.Token))
                {
                    connectTimeout.CancelAfter(TimeSpan.FromSeconds(5));
                    await backend.ConnectAsync(IPAddress.Loopback, 18080, connectTimeout.Token);
                }
                using var incoming = client.GetStream(); using var outgoing = backend.GetStream();
                var up = incoming.CopyToAsync(outgoing, linked.Token);
                var down = outgoing.CopyToAsync(incoming, linked.Token);
                try { await await Task.WhenAny(up, down); }
                finally
                {
                    linked.Cancel(); client.Dispose(); backend.Dispose();
                    try { await Task.WhenAll(up, down); } catch (Exception) when (linked.IsCancellationRequested) { }
                }
            }
            catch (Exception ex) when (ex is SocketException or IOException or OperationCanceledException or ObjectDisposedException) { }
            finally { session.DetachRelay(client, backend); }
        }
    }
    public async Task StopAsync()
    {
        _stop.Cancel(); _listener.Stop();
        if (_accept is not null) { try { await _accept; } catch (Exception) { } }
        try { await Task.WhenAll(_tasks.Values); } catch (Exception) { }
    }
    public void Dispose() { _stop.Cancel(); _listener.Stop(); _stop.Dispose(); }
}
