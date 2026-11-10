using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MiniVpn.Management;

var builder = Host.CreateApplicationBuilder(args);
if (Environment.GetEnvironmentVariable("MINIVPN_CONTROL_TOKEN") is not { Length: >= 32 })
    throw new InvalidOperationException("Watchdog requires MINIVPN_CONTROL_TOKEN (32+ characters).");
var configFile = Environment.GetEnvironmentVariable("MINIVPN_CONFIG");
if (!string.IsNullOrWhiteSpace(configFile)) builder.Configuration.AddJsonFile(Path.GetFullPath(configFile), optional: false);
builder.Configuration.AddEnvironmentVariables();
var options = ManagementOptions.Read(builder.Configuration);
builder.Services.AddSingleton(options);
builder.Services.AddSingleton<IVpnAuditStore>(_ => new JsonLineAuditStore(options.AuditDirectory, options.RetentionDays));
builder.Services.AddSingleton(new AlertHistory(options.AlertDirectory, options.RetentionDays));
builder.Services.AddSingleton<IAlertNotifier, ConfiguredAlertNotifier>();
builder.Services.AddSingleton<AlertService>();
builder.Services.AddHostedService(s => s.GetRequiredService<AlertService>());
builder.Services.AddHostedService<WatchdogWorker>();
await builder.Build().RunAsync();
