using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Hosting;

namespace MiniVpn.Management;

public sealed record RuntimeStamp(string Status, DateTimeOffset StartedAt, DateTimeOffset Heartbeat, int ProcessId);
public static class WatchdogPolicy
{
    public static string Evaluate(bool reachable, RuntimeStamp? status, RuntimeStamp? diskStatus, DateTimeOffset now, TimeSpan maximumAge)
    {
        if (reachable && status is { Status: "running" } && now - status.Heartbeat <= maximumAge) return "healthy";
        if (diskStatus is { Status: "stopped" }) return "intentional-stop";
        return "failure";
    }
}
public sealed class WatchdogWorker(ManagementOptions options, AlertService alerts, IVpnAuditStore audit) : BackgroundService
{
    private readonly HttpClient _http = new(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(4) };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var token = Environment.GetEnvironmentVariable("MINIVPN_CONTROL_TOKEN");
        if (token is null || token.Length < 32) throw new InvalidOperationException("Watchdog requires MINIVPN_CONTROL_TOKEN (32+ characters).");
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var failures = 0; var wasFailed = false; var previousStatus = "";
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.SampleSeconds));
        do
        {
            RuntimeStamp? remote = null, local = null; var reachable = false;
            try
            {
                using var response = await _http.GetAsync($"http://127.0.0.1:{options.ControlPort}/control/health", stoppingToken);
                reachable = response.IsSuccessStatusCode;
                if (reachable) remote = JsonSerializer.Deserialize<RuntimeStamp>(await response.Content.ReadAsStringAsync(stoppingToken), Json);
            }
            catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or JsonException) { }
            try { if (File.Exists(options.StatusFile)) local = JsonSerializer.Deserialize<RuntimeStamp>(await File.ReadAllTextAsync(options.StatusFile, stoppingToken), Json); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
            var status = WatchdogPolicy.Evaluate(reachable, remote, local, DateTimeOffset.UtcNow, TimeSpan.FromSeconds(options.SampleSeconds * 3 + 5));
            if (status == "failure") failures++; else failures = 0;
            if (failures >= options.WatchdogFailures)
            {
                wasFailed = true;
                alerts.Publish("watchdog-vpn", "critical", "vpn-unresponsive", "Watchdog độc lập: VPN server không phản hồi hoặc heartbeat quá hạn.");
            }
            if (status == "healthy" && wasFailed)
            { alerts.Publish("watchdog-recovered", "warning", "vpn-recovered", "VPN server đã phản hồi trở lại."); wasFailed = false; }
            if (status != previousStatus)
            {
                audit.Write("watchdog", status, new("external-watchdog", Guid.NewGuid().ToString("N")),
                    status == "intentional-stop" ? "Intentional shutdown marker found; failure alert suppressed" : "Watchdog state: " + status);
                previousStatus = status;
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
    public override void Dispose() { _http.Dispose(); base.Dispose(); }
}
