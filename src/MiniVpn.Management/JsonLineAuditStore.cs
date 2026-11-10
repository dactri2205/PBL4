using System.Text;
using System.Text.Json;

namespace MiniVpn.Management;

public sealed class JsonLineAuditStore(string directory, int retentionDays = 30) : IVpnAuditStore
{
    private readonly string _directory = Path.GetFullPath(directory);
    private readonly object _gate = new();
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private int _healthy = 1;
    public bool IsHealthy => Volatile.Read(ref _healthy) == 1;
    public void Write(string type, string outcome, OperationContext context, string message,
        string? username = null, string? sessionId = null, string? sourceIp = null, string? vpnIp = null)
    {
        var now = DateTimeOffset.UtcNow;
        var item = new AuditEvent(Guid.NewGuid().ToString("N"), now, VpnValidation.Clean(type, 64),
            VpnValidation.Clean(username, 32), VpnValidation.Clean(sessionId, 64), VpnValidation.Clean(sourceIp, 64),
            VpnValidation.Clean(vpnIp, 64), VpnValidation.Clean(outcome, 24), VpnValidation.Clean(context.Actor, 80),
            VpnValidation.Clean(context.CorrelationId, 64), VpnValidation.Clean(message));
        lock (_gate)
        {
            try
            {
                Directory.CreateDirectory(_directory);
                var path = Path.Combine(_directory, now.ToString("yyyy-MM-dd") + ".jsonl");
                using var file = OpenRetry(path, FileMode.Append, FileAccess.Write, FileShare.Read);
                using var writer = new StreamWriter(file, new UTF8Encoding(false));
                writer.WriteLine(JsonSerializer.Serialize(item, Json)); writer.Flush();
                Volatile.Write(ref _healthy, 1);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                if (Interlocked.Exchange(ref _healthy, 0) == 1) Console.Error.WriteLine("VPN audit storage unavailable. Check disk and permissions on the server.");
            }
        }
    }
    internal static FileStream OpenRetry(string path, FileMode mode, FileAccess access, FileShare share)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { return new FileStream(path, mode, access, share); }
            catch (IOException) when (attempt < 10) { Thread.Sleep(20); }
        }
    }
    public PageResult<AuditEvent> Query(AuditQuery query)
    {
        var to = query.To ?? DateTimeOffset.UtcNow;
        var from = query.From ?? to.AddDays(-1);
        if (query.Page < 1 || query.Page > 10000 || query.PageSize is < 1 or > 100 || from > to || to - from > TimeSpan.FromDays(31))
            throw new VpnException(400, "invalid_query", "Trang 1–10000, tối đa 100 dòng/trang, khoảng thời gian tối đa 31 ngày.");
        VpnValidation.Text(query.Username, 32); VpnValidation.Text(query.EventType, 64); VpnValidation.Text(query.Outcome, 24);
        var items = new List<AuditEvent>();
        lock (_gate)
        {
            for (var day = from.UtcDateTime.Date; day <= to.UtcDateTime.Date; day = day.AddDays(1))
            {
                var path = Path.Combine(_directory, day.ToString("yyyy-MM-dd") + ".jsonl");
                if (!File.Exists(path)) continue;
                using var file = OpenRetry(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var reader = new StreamReader(file);
                while (reader.ReadLine() is { } line)
                {
                    AuditEvent? item;
                    try { item = JsonSerializer.Deserialize<AuditEvent>(line, Json); } catch (JsonException) { continue; }
                    if (item is null || item.Timestamp < from || item.Timestamp > to ||
                        (!string.IsNullOrEmpty(query.Username) && item.Username != query.Username) ||
                        (!string.IsNullOrEmpty(query.EventType) && item.EventType != query.EventType) ||
                        (!string.IsNullOrEmpty(query.Outcome) && item.Outcome != query.Outcome)) continue;
                    items.Add(item);
                }
            }
        }
        var ordered = items.OrderByDescending(x => x.Timestamp).ThenByDescending(x => x.EventId).ToArray();
        return new(ordered.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToArray(), query.Page, query.PageSize, ordered.Length);
    }
    public void Prune()
    {
        lock (_gate)
        {
            if (!Directory.Exists(_directory)) return;
            var cutoff = DateTime.UtcNow.Date.AddDays(-Math.Clamp(retentionDays, 1, 3650));
            foreach (var path in Directory.EnumerateFiles(_directory, "*.jsonl"))
                if (DateTime.TryParseExact(Path.GetFileNameWithoutExtension(path), "yyyy-MM-dd", null,
                        System.Globalization.DateTimeStyles.None, out var day) && day < cutoff)
                { try { File.Delete(path); } catch (IOException) { } }
        }
    }
}
