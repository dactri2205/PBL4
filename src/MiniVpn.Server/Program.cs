using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using MiniVpn.Management;
using MiniVpn.Server;
using MiniVpn.Server.Runtime;

try
{
    var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [], ContentRootPath = Directory.GetCurrentDirectory() });
    var configFile = Environment.GetEnvironmentVariable("MINIVPN_CONFIG");
    if (!string.IsNullOrWhiteSpace(configFile)) builder.Configuration.AddJsonFile(Path.GetFullPath(configFile), optional: false);
    builder.Configuration.AddEnvironmentVariables();
    var settings = ManagementOptions.Read(builder.Configuration);
    if (AccountCli.IsCommand(args)) { await AccountCli.RunAsync(args, settings); return; }
    if (args.Length != 4)
    {
        Console.WriteLine("Usage: MiniVpn.Server <LAN IPv4> <server.pfx> <accounts.json> <VPN port>\n       MiniVpn.Server add-user|list-users|disable-user|enable-user|reset-password|delete-user|disconnect-user <accounts.json> [username]");
        return;
    }
    if (!IPAddress.TryParse(args[0], out var address) || address.AddressFamily != AddressFamily.InterNetwork || address.Equals(IPAddress.Any) || IPAddress.IsLoopback(address))
        throw new ArgumentException("Specify the actual LAN IPv4 address, not 0.0.0.0 or loopback");
    if (!int.TryParse(args[3], out var port) || port is < 1024 or > 65535 || port == settings.ControlPort) throw new ArgumentException("Invalid VPN port");
    if (!NetworkInterface.GetAllNetworkInterfaces().SelectMany(n => n.GetIPProperties().UnicastAddresses).Any(a => a.Address.Equals(address)))
        throw new ArgumentException("LAN IPv4 is not assigned to this computer. Check ipconfig.");
    if (!File.Exists(args[1])) throw new FileNotFoundException("Certificate missing. Run scripts/Make-DemoCertificate.ps1.");
    if (!File.Exists(args[2])) throw new FileNotFoundException("Accounts missing. Run add-user first.");
    if (!File.Exists(Path.Combine(AppContext.BaseDirectory, "wintun.dll"))) throw new FileNotFoundException("Copy official AMD64 wintun.dll next to MiniVpn.Server.exe.");
    if (!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator)) throw new InvalidOperationException("Wintun requires Administrator PowerShell.");
    var pfxPassword = Environment.GetEnvironmentVariable("MINIVPN_PFX_PASSWORD") ?? throw new InvalidOperationException("Set MINIVPN_PFX_PASSWORD.");
    using var certificate = X509CertificateLoader.LoadPkcs12FromFile(args[1], pfxPassword, X509KeyStorageFlags.UserKeySet);
    var token = Environment.GetEnvironmentVariable("MINIVPN_CONTROL_TOKEN");
    if (!string.IsNullOrEmpty(token) && token.Length < 32) throw new InvalidOperationException("MINIVPN_CONTROL_TOKEN requires at least 32 characters.");
    builder.WebHost.ConfigureKestrel(k => { k.Listen(IPAddress.Loopback, settings.ControlPort); k.Limits.MaxRequestBodySize = 16384; });
    builder.Services.AddVpnManagement(settings, Path.GetFullPath(args[2]));
    builder.Services.AddSingleton(new TunnelOptions(address, port, certificate));
    builder.Services.AddSingleton<ITunnelDevice, WintunDevice>();
    builder.Services.AddSingleton<IVpnWebRelay, WebRelay>();
    builder.Services.AddHostedService<TunnelServer>();
    var app = builder.Build();
    _ = app.Services.GetRequiredService<IVpnAccountStore>();
    app.UseVpnErrors(); app.MapVpnControl(token);
    await app.RunAsync();
}
catch (VpnException ex) { Console.Error.WriteLine($"{ex.Code}: {ex.Message}"); Environment.ExitCode = 1; }
catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or IOException)
{ Console.Error.WriteLine(ex.Message); Environment.ExitCode = 1; }
