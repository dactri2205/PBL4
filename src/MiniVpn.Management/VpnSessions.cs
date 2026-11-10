using System.Net.Sockets;
using System.Threading.Channels;

namespace MiniVpn.Management;

public sealed class VpnSession(string username, string sourceIp, string vpnIp, Action closeTransport)
{
    private readonly object _gate = new();
    private readonly HashSet<TcpClient> _relays = [];
    private readonly CancellationTokenSource _cancel = new();
    private bool _closing;
    private long _received, _sent;
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public string Username { get; } = username;
    public string SourceIp { get; } = sourceIp;
    public string VpnIp { get; } = vpnIp;
    public DateTimeOffset ConnectedAt { get; } = DateTimeOffset.UtcNow;
    public string? CloseReason { get; private set; }
    public CancellationToken Cancellation => _cancel.Token;
    public bool Closing { get { lock (_gate) return _closing; } }
    public Channel<byte[]> Outgoing { get; } = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(256)
        { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });
    public SessionInfo Info() => new(Id, Username, SourceIp, VpnIp, ConnectedAt,
        (DateTimeOffset.UtcNow - ConnectedAt).TotalSeconds, Interlocked.Read(ref _received), Interlocked.Read(ref _sent), Closing);
    public bool RunIfActive(Action action)
    {
        lock (_gate) { if (_closing) return false; action(); return true; }
    }
    public void CountReceived(int bytes) => Interlocked.Add(ref _received, bytes);
    public void CountSent(int bytes) => Interlocked.Add(ref _sent, bytes);
    public bool AttachRelay(TcpClient client, TcpClient backend)
    {
        lock (_gate)
        {
            if (_closing) return false;
            _relays.Add(client); _relays.Add(backend); return true;
        }
    }
    public void DetachRelay(TcpClient client, TcpClient backend)
    {
        lock (_gate) { _relays.Remove(client); _relays.Remove(backend); }
    }
    public bool Revoke(string reason)
    {
        lock (_gate)
        {
            if (_closing) return false;
            _closing = true; CloseReason = reason;
            _cancel.Cancel(); Outgoing.Writer.TryComplete();
            closeTransport();
            foreach (var relay in _relays) relay.Dispose();
            _relays.Clear();
            return true;
        }
    }
}

public sealed class VpnSessionManager(IVpnAuditStore audit) : IVpnSessionManager
{
    private readonly object _gate = new();
    private readonly Dictionary<string, VpnSession> _byId = [];
    private readonly Dictionary<string, VpnSession> _byIp = [];
    private long _completedReceived, _completedSent;
    private static OperationContext Runtime => new("vpn-runtime", Guid.NewGuid().ToString("N"));
    public VpnSession Create(string username, string sourceIp, Action closeTransport)
    {
        lock (_gate)
        {
            string? ip = Enumerable.Range(2, 253).Select(n => $"10.8.0.{n}").FirstOrDefault(ip => !_byIp.ContainsKey(ip));
            if (ip is null) throw new VpnException(409, "pool_exhausted", "Không còn địa chỉ VPN.");
            var session = new VpnSession(username, sourceIp, ip, closeTransport);
            _byId.Add(session.Id, session); _byIp.Add(ip, session);
            return session;
        }
    }
    public IReadOnlyList<SessionInfo> List() { lock (_gate) return _byId.Values.Select(s => s.Info()).OrderBy(s => s.ConnectedAt).ToArray(); }
    public VpnSession? FindByIp(string ip) { lock (_gate) return _byIp.TryGetValue(ip, out var s) && !s.Closing ? s : null; }
    public bool Revoke(string sessionId, string reason) { lock (_gate) return _byId.TryGetValue(sessionId, out var s) && s.Revoke(reason); }
    public int RevokeUser(string username, string reason)
    {
        lock (_gate) return _byId.Values.Where(s => s.Username == username).Count(s => s.Revoke(reason));
    }
    public void RevokeAll(string reason) { lock (_gate) foreach (var s in _byId.Values) s.Revoke(reason); }
    public void Complete(VpnSession session, string reason)
    {
        lock (_gate)
        {
            session.Revoke(reason);
            if (!_byId.Remove(session.Id)) return;
            // IPs are returned only after the tunnel's send/read tasks have finished.
            _byIp.Remove(session.VpnIp);
            var info = session.Info();
            _completedReceived += info.ReceivedBytes; _completedSent += info.SentBytes;
        }
        audit.Write("disconnected", "success", Runtime, session.CloseReason ?? reason,
            session.Username, session.Id, session.SourceIp, session.VpnIp);
    }
    public long ReceivedBytes { get { lock (_gate) return _completedReceived + _byId.Values.Sum(s => s.Info().ReceivedBytes); } }
    public long SentBytes { get { lock (_gate) return _completedSent + _byId.Values.Sum(s => s.Info().SentBytes); } }
}
