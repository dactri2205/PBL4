using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;

namespace MiniVpn.Management;

public sealed class ConfiguredAlertNotifier : IAlertNotifier, IDisposable
{
    private readonly HttpClient _http = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(5) };
    private readonly string? _discord = Environment.GetEnvironmentVariable("MINIVPN_DISCORD_WEBHOOK");
    private readonly string? _telegramToken = Environment.GetEnvironmentVariable("MINIVPN_TELEGRAM_TOKEN");
    private readonly string? _telegramChat = Environment.GetEnvironmentVariable("MINIVPN_TELEGRAM_CHAT_ID");
    public bool Enabled => !string.IsNullOrWhiteSpace(_discord) || (!string.IsNullOrWhiteSpace(_telegramToken) && !string.IsNullOrWhiteSpace(_telegramChat));
    public string Provider => !string.IsNullOrWhiteSpace(_discord) ? "Discord" : Enabled ? "Telegram" : "Disabled";
    public async Task SendAsync(string text, CancellationToken cancellationToken)
    {
        if (!Enabled) return;
        HttpResponseMessage response;
        if (!string.IsNullOrWhiteSpace(_discord))
        {
            if (!Uri.TryCreate(_discord, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
                uri.Host is not ("discord.com" or "discordapp.com") || !uri.AbsolutePath.StartsWith("/api/webhooks/"))
                throw new InvalidOperationException("Invalid notification configuration.");
            response = await _http.PostAsJsonAsync(uri, new { content = VpnValidation.Clean(text, 1500), allowed_mentions = new { parse = Array.Empty<string>() } }, cancellationToken);
        }
        else
        {
            if (_telegramToken!.Any(c => !char.IsAsciiLetterOrDigit(c) && c != ':' && c != '_' && c != '-'))
                throw new InvalidOperationException("Invalid notification configuration.");
            response = await _http.PostAsJsonAsync("https://api.telegram.org/bot" + _telegramToken + "/sendMessage",
                new { chat_id = _telegramChat, text = VpnValidation.Clean(text, 1500), disable_web_page_preview = true }, cancellationToken);
        }
        using (response) response.EnsureSuccessStatusCode();
    }
    public void Dispose() => _http.Dispose();
}

public sealed class AlertHistory(string directory, int retentionDays = 30)
{
    private readonly object _gate = new();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public void Append(AlertRecord record)
    {
        lock (_gate)
        {
            Directory.CreateDirectory(directory);
            using var file = JsonLineAuditStore.OpenRetry(Path.Combine(directory, record.Timestamp.ToString("yyyy-MM-dd") + ".jsonl"), FileMode.Append, FileAccess.Write, FileShare.Read);
            using var writer = new StreamWriter(file);
            writer.WriteLine(JsonSerializer.Serialize(record, Json));
        }
    }
    public IReadOnlyList<AlertRecord> Recent(int count = 100)
    {
        count = Math.Clamp(count, 1, 100);
        var records = new List<AlertRecord>();
        lock (_gate)
        {
            if (!Directory.Exists(directory)) return records;
            foreach (var path in Directory.EnumerateFiles(directory, "*.jsonl").OrderDescending().Take(Math.Clamp(retentionDays, 1, 3650)))
            {
                using var file = JsonLineAuditStore.OpenRetry(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var reader = new StreamReader(file);
                while (reader.ReadLine() is { } line)
                {
                    try { if (JsonSerializer.Deserialize<AlertRecord>(line, Json) is { } item) records.Add(item); } catch (JsonException) { }
                }
                if (records.Count >= count) break;
            }
        }
        return records.OrderByDescending(x => x.Timestamp).Take(count).ToArray();
    }
    public void Prune() => new JsonLineAuditStore(directory, retentionDays).Prune();
}

public sealed class AlertService(IAlertNotifier notifier, AlertHistory history, IVpnAuditStore audit,
    ManagementOptions options, TimeProvider? timeProvider = null) : BackgroundService
{
    private readonly TimeProvider _clock = timeProvider ?? TimeProvider.System;
    private readonly object _gate = new();
    private readonly Dictionary<string, DateTimeOffset> _last = [];
    private readonly Channel<AlertRecord> _queue = Channel.CreateBounded<AlertRecord>(new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.Wait, SingleReader = true });
    public bool Publish(string key, string severity, string eventType, string message)
    {
        lock (_gate)
        {
            var now = _clock.GetUtcNow();
            if (_last.TryGetValue(key, out var last) && now - last < TimeSpan.FromSeconds(options.AlertCooldownSeconds)) return false;
            if (_last.Count > 10000)
                foreach (var old in _last.Where(x => now - x.Value > TimeSpan.FromSeconds(options.AlertCooldownSeconds)).Select(x => x.Key).ToArray()) _last.Remove(old);
            if (_last.Count > 10000) return false;
            if (!_queue.Writer.TryWrite(new(Guid.NewGuid().ToString("N"), now, VpnValidation.Clean(severity, 24),
                    VpnValidation.Clean(eventType, 64), VpnValidation.Clean(message), "pending", 0))) return false;
            _last[key] = now; return true;
        }
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var alert in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            var status = "disabled"; var attempts = 0;
            if (notifier.Enabled)
            {
                status = "failed";
                for (var attempt = 1; attempt <= 3; attempt++)
                {
                    attempts = attempt;
                    try
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(TimeSpan.FromSeconds(6));
                        await notifier.SendAsync($"[{alert.Severity}] {alert.EventType}: {alert.Message}", timeout.Token);
                        status = "sent"; break;
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
                    catch (Exception) { /* Don't log webhook URLs, tokens or provider response bodies. */ }
                    if (attempt < 3) await Task.Delay(TimeSpan.FromSeconds(attempt), stoppingToken);
                }
            }
            try
            {
                history.Append(alert with { DeliveryStatus = status, Attempts = attempts });
                audit.Write("alert", status, new("alert-service", alert.AlertId), alert.EventType + ": " + alert.Message);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            { Console.Error.WriteLine("Alert history storage unavailable."); }
        }
    }
}
