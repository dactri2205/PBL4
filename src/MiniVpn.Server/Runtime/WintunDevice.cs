using MiniVpn.Wintun;

namespace MiniVpn.Server.Runtime;

public sealed class WintunDevice : ITunnelDevice
{
    private Tun? _tun;
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _tun = new Tun("MiniVpn-Server");
        try { await NetConfig.ConfigureAsync(_tun.InterfaceIndex, "10.8.0.1", server: true); }
        catch
        {
            try { await NetConfig.CleanupAsync(_tun.InterfaceIndex, "10.8.0.1"); } finally { _tun.Dispose(); _tun = null; }
            throw;
        }
        Console.WriteLine($"Wintun ifIndex={_tun.InterfaceIndex} 10.8.0.1/24");
    }
    public byte[]? Receive(CancellationToken cancellationToken) => _tun!.Receive(cancellationToken);
    public void Send(byte[] packet) => _tun!.Send(packet);
    public async Task StopAsync()
    {
        if (_tun is null) return;
        try { await NetConfig.CleanupAsync(_tun.InterfaceIndex, "10.8.0.1"); }
        finally { _tun.Dispose(); _tun = null; }
    }
}
