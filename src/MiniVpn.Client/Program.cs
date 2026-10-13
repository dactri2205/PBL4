using System.Text;
using MiniVpn.ClientCore;

if (args.Length != 4 || !int.TryParse(args[1], out int port))
{
    Console.WriteLine("Usage: MiniVpn.Client <server LAN IPv4> <VPN port> <username> <SHA256 certificate fingerprint>");
    return;
}
using var stop = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; stop.Cancel(); };
Console.Write("VPN password: ");
var value = new StringBuilder();
ConsoleKeyInfo key;
while ((key = Console.ReadKey(true)).Key != ConsoleKey.Enter)
{ if (key.Key == ConsoleKey.Backspace && value.Length > 0) value.Length--; else if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar); }
Console.WriteLine();
try
{
    await VpnConnection.RunAsync(new VpnOptions(args[0], port, args[2], value.ToString(), args[3]),
        state => Console.WriteLine(state.Message), stop.Token);
}
catch (OperationCanceledException) { Console.WriteLine("Đã ngắt VPN."); }
catch (Exception ex) { Console.Error.WriteLine("Không thể kết nối: " + ex.Message); Environment.ExitCode = 1; }
