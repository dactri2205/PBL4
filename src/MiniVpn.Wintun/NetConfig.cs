using System.Diagnostics;
using System.Net;

namespace MiniVpn.Wintun;

public static class NetConfig
{
    public static async Task ConfigureAsync(uint index, string address, bool server)
    {
        if (!IPAddress.TryParse(address, out var ip) || ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork ||
            (server && address != "10.8.0.1") || (!server && (!address.StartsWith("10.8.0.") || ip.GetAddressBytes()[3] is < 2 or > 254)))
            throw new ArgumentException("Invalid VPN address");
        string prefix = server ? "24" : "32";
        string script = $"$ErrorActionPreference='Stop'; New-NetIPAddress -InterfaceIndex {index} -IPAddress {address} -PrefixLength {prefix} -PolicyStore ActiveStore | Out-Null; " +
            (server ? "" : $"New-NetRoute -DestinationPrefix '10.8.0.1/32' -InterfaceIndex {index} -NextHop '0.0.0.0' -PolicyStore ActiveStore | Out-Null;");
        await RunAsync(script);
    }
    public static async Task CleanupAsync(uint index, string address)
    {
        string script = $"$ErrorActionPreference='Stop'; Get-NetRoute -InterfaceIndex {index} -DestinationPrefix '10.8.0.1/32' -ErrorAction SilentlyContinue | Remove-NetRoute -Confirm:$false; " +
            $"Get-NetIPAddress -InterfaceIndex {index} -IPAddress {address} -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false";
        await RunAsync(script);
    }
    private static async Task RunAsync(string script)
    {
        var p = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        p.ArgumentList.Add("-NoProfile"); p.ArgumentList.Add("-NonInteractive"); p.ArgumentList.Add("-Command"); p.ArgumentList.Add(script);
        using var process = Process.Start(p) ?? throw new InvalidOperationException("PowerShell not available");
        Task<string> output = process.StandardOutput.ReadToEndAsync(), error = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new InvalidOperationException("Network configuration failed: " + await error + await output);
    }
}
