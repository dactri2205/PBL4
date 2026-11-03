using MiniVpn.Common;

namespace MiniVpn.Management;

public sealed class VpnManagementService(IVpnAccountStore accounts, IVpnSessionManager sessions,
    IVpnAuditStore audit, AlertService alerts)
{
    // Authentication + registration and all account changes share this gate. A disabled/deleted
    // account cannot register a session between password verification and revocation.
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly AttemptLimiter _loginAttempts = new(6, TimeSpan.FromMinutes(5));
    public IReadOnlyList<AccountInfo> Accounts() => accounts.List();
    public async Task<VpnSession?> LoginAsync(string? username, string? password, string sourceIp,
        Action closeTransport, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var context = new OperationContext("vpn-client", Guid.NewGuid().ToString("N"));
            var blocked = _loginAttempts.IsBlocked(sourceIp);
            var account = username is not null ? accounts.Find(username) : null;
            if (blocked || password is null || password.Length > 256 || account is not { Enabled: true } || !Passwords.Verify(password, account.Password))
            {
                var failures = _loginAttempts.Fail(sourceIp);
                audit.Write("login", "failure", context, blocked ? "Authentication rate limited" : "Invalid credentials",
                    username, sourceIp: sourceIp);
                if (failures >= 6) alerts.Publish("login-failures:" + sourceIp, "warning", "login-failures", "Nhiều lần xác thực VPN thất bại từ " + sourceIp);
                return null;
            }
            var session = sessions.Create(account.Username, sourceIp, closeTransport);
            _loginAttempts.Reset(sourceIp);
            audit.Write("login", "success", context, "Credentials accepted", account.Username, session.Id, sourceIp, session.VpnIp);
            audit.Write("connected", "success", context, "VPN session registered", account.Username, session.Id, sourceIp, session.VpnIp);
            return session;
        }
        finally { _gate.Release(); }
    }
    public async Task<AccountInfo> CreateAsync(CreateAccount request, OperationContext context, CancellationToken ct = default)
    {
        VpnValidation.Username(request.Username); VpnValidation.Password(request.Password);
        var notes = VpnValidation.Text(request.Notes, 300); var externalId = VpnValidation.Text(request.ExternalUserId, 100);
        await _gate.WaitAsync(ct);
        try
        {
            if (accounts.Find(request.Username) is not null) throw new VpnException(409, "account_exists", "Tài khoản đã tồn tại.");
            var now = DateTimeOffset.UtcNow;
            var item = new StoredAccount(request.Username, true, now, now, notes, externalId, Passwords.Create(request.Password));
            accounts.Put(item);
            audit.Write("account-created", "success", context, "VPN account created", item.Username);
            return item.Public();
        }
        finally { _gate.Release(); }
    }
    public async Task<AccountInfo> SetEnabledAsync(string username, bool enabled, OperationContext context, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var current = Require(username);
            var next = current with { Enabled = enabled, UpdatedAt = DateTimeOffset.UtcNow };
            accounts.Put(next);
            if (!enabled) sessions.RevokeUser(username, "account-disabled");
            audit.Write(enabled ? "account-enabled" : "account-disabled", "success", context,
                enabled ? "Account enabled; no automatic reconnect" : "Account disabled; sessions revoked", username);
            return next.Public();
        }
        finally { _gate.Release(); }
    }
    public async Task ResetPasswordAsync(string username, string password, OperationContext context, CancellationToken ct = default)
    {
        VpnValidation.Password(password);
        await _gate.WaitAsync(ct);
        try
        {
            var current = Require(username);
            accounts.Put(current with { Password = Passwords.Create(password), UpdatedAt = DateTimeOffset.UtcNow });
            sessions.RevokeUser(username, "password-reset");
            audit.Write("password-reset", "success", context, "Password reset; all sessions revoked", username);
        }
        finally { _gate.Release(); }
    }
    public async Task DeleteAsync(string username, OperationContext context, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            Require(username); accounts.Delete(username); sessions.RevokeUser(username, "account-deleted");
            audit.Write("account-deleted", "success", context, "Account deleted; sessions revoked", username);
        }
        finally { _gate.Release(); }
    }
    public bool Disconnect(string id, OperationContext context)
    {
        var session = sessions.List().FirstOrDefault(s => s.SessionId == id);
        if (session is null) throw new VpnException(404, "session_not_found", "Không tìm thấy phiên.");
        var revoked = sessions.Revoke(id, "admin-disconnect");
        audit.Write("admin-disconnect", "success", context, "Session revoked by administrator",
            session.Username, session.SessionId, session.SourceIp, session.VpnIp);
        return revoked;
    }
    public async Task<int> DisconnectUserAsync(string username, OperationContext context, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            Require(username);
            var count = sessions.RevokeUser(username, "admin-disconnect-all");
            audit.Write("admin-disconnect-all", "success", context, "User sessions revoked: " + count, username);
            return count;
        }
        finally { _gate.Release(); }
    }
    private StoredAccount Require(string username)
    {
        VpnValidation.Username(username);
        return accounts.Find(username) ?? throw new VpnException(404, "account_not_found", "Không tìm thấy tài khoản VPN.");
    }
}

public sealed class AttemptLimiter(int limit, TimeSpan window)
{
    private readonly object _gate = new();
    private readonly Dictionary<string, (int Count, DateTimeOffset Until)> _entries = [];
    public bool IsBlocked(string key) { lock (_gate) return _entries.TryGetValue(key, out var e) && e.Count >= limit && e.Until > DateTimeOffset.UtcNow; }
    public int Fail(string key)
    {
        lock (_gate)
        {
            var now = DateTimeOffset.UtcNow;
            if (_entries.Count >= 10000)
                foreach (var expired in _entries.Where(e => e.Value.Until <= now).Select(e => e.Key).ToArray()) _entries.Remove(expired);
            if (_entries.Count >= 10000 && !_entries.ContainsKey(key)) return limit;
            var next = _entries.TryGetValue(key, out var e) && e.Until > now ? (e.Count + 1, e.Until) : (1, now + window);
            _entries[key] = next; return next.Item1;
        }
    }
    public void Reset(string key) { lock (_gate) _entries.Remove(key); }
}
