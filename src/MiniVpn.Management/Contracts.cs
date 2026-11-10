using MiniVpn.Common;

namespace MiniVpn.Management;

public sealed class VpnException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
public sealed record AccountInfo(string Username, bool Enabled, DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt, string? Notes, string? ExternalUserId);
public sealed record StoredAccount(string Username, bool Enabled, DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt, string? Notes, string? ExternalUserId, PasswordRecord Password)
{
    public AccountInfo Public() => new(Username, Enabled, CreatedAt, UpdatedAt, Notes, ExternalUserId);
}
public sealed record CreateAccount(string Username, string Password, string? Notes = null, string? ExternalUserId = null);
public sealed record ResetPassword(string Password);
public sealed record AuditEvent(string EventId, DateTimeOffset Timestamp, string EventType, string? Username,
    string? SessionId, string? SourceIp, string? VpnIp, string Outcome, string Actor, string CorrelationId, string Message);
public sealed record AuditQuery(DateTimeOffset? From = null, DateTimeOffset? To = null, string? Username = null,
    string? EventType = null, string? Outcome = null, int Page = 1, int PageSize = 50);
public sealed record PageResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
public sealed record OperationContext(string Actor, string CorrelationId);
public sealed record SessionInfo(string SessionId, string Username, string SourceIp, string VpnIp,
    DateTimeOffset ConnectedAt, double DurationSeconds, long ReceivedBytes, long SentBytes, bool Closing);
public sealed record AlertRecord(string AlertId, DateTimeOffset Timestamp, string Severity, string EventType,
    string Message, string DeliveryStatus, int Attempts);
public sealed record MetricsSnapshot(DateTimeOffset SampledAt, string VpnStatus, DateTimeOffset StartedAt,
    double UptimeSeconds, string WebStatus, int ActiveSessions, double? ProcessCpuPercent, long? ProcessRamBytes,
    long? SystemRamTotalBytes, long? SystemRamAvailableBytes, long? DiskTotalBytes, long? DiskFreeBytes,
    long ReceivedPayloadBytes, long SentPayloadBytes, string Scope);
public interface IVpnAccountStore : IDisposable
{
    IReadOnlyList<AccountInfo> List();
    StoredAccount? Find(string username);
    void Put(StoredAccount account);
    void Delete(string username);
}
public interface IVpnAuditStore
{
    bool IsHealthy => true;
    void Write(string type, string outcome, OperationContext context, string message,
        string? username = null, string? sessionId = null, string? sourceIp = null, string? vpnIp = null);
    PageResult<AuditEvent> Query(AuditQuery query);
    void Prune();
}
public interface IVpnSessionManager
{
    VpnSession Create(string username, string sourceIp, Action closeTransport);
    IReadOnlyList<SessionInfo> List();
    VpnSession? FindByIp(string ip);
    bool Revoke(string sessionId, string reason);
    int RevokeUser(string username, string reason);
    void Complete(VpnSession session, string reason);
    void RevokeAll(string reason);
    long ReceivedBytes { get; }
    long SentBytes { get; }
}
public interface ISystemMetricsProvider { MetricsSnapshot Sample(string webStatus); }
public interface IAlertNotifier
{
    bool Enabled { get; }
    string Provider { get; }
    Task SendAsync(string text, CancellationToken cancellationToken);
}
public static class VpnValidation
{
    public static void Username(string? name)
    {
        if (name is null || name.Length is < 1 or > 32 || name.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_'))
            throw new VpnException(400, "invalid_username", "Tên tài khoản cần 1–32 chữ ASCII, số hoặc dấu gạch dưới.");
    }
    public static void Password(string? password)
    {
        if (password is null || password.Length is < 12 or > 256)
            throw new VpnException(400, "invalid_password", "Mật khẩu cần 12–256 ký tự.");
    }
    public static string? Text(string? value, int maximum)
    {
        if (value is null) return null;
        if (value.Length > maximum || value.Any(char.IsControl))
            throw new VpnException(400, "invalid_text", "Nội dung quá dài hoặc có ký tự điều khiển.");
        return value.Trim();
    }
    public static string Clean(string? value, int maximum = 200) =>
        new((value ?? "").Where(c => !char.IsControl(c)).Take(maximum).ToArray());
}
