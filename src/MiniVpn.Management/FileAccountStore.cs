using System.Text.Json;
using MiniVpn.Common;

namespace MiniVpn.Management;

// A lifetime OS file lock serializes owners, including offline CLI processes.
public sealed class FileAccountStore : IVpnAccountStore
{
    private sealed record Document(int SchemaVersion, List<StoredAccount> Accounts);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _path;
    private readonly FileStream _ownership;
    private readonly object _gate = new();
    private Dictionary<string, StoredAccount> _accounts = new(StringComparer.Ordinal);
    public FileAccountStore(string path)
    {
        _path = Path.GetFullPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        try { _ownership = new FileStream(_path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
        catch (IOException) { throw new VpnException(409, "store_in_use", "Kho tài khoản đang được sử dụng. Khi VPN chạy, dùng control API có xác thực."); }
        try { Load(); } catch { _ownership.Dispose(); throw; }
    }
    private void Load()
    {
        if (!File.Exists(_path)) return;
        var raw = File.ReadAllText(_path);
        using var document = JsonDocument.Parse(raw);
        if (document.RootElement.TryGetProperty("schemaVersion", out var version) && version.ValueKind == JsonValueKind.Number)
        {
            if (version.GetInt32() != 1) throw new InvalidDataException("Unsupported accounts schema; no changes made.");
            var data = JsonSerializer.Deserialize<Document>(raw, Json) ?? throw new InvalidDataException("Empty account store");
            foreach (var account in data.Accounts) { ValidateStored(account); _accounts.Add(account.Username, account); }
            return;
        }
        var legacy = JsonSerializer.Deserialize<Dictionary<string, PasswordRecord>>(raw, Json)
            ?? throw new InvalidDataException("Empty legacy account store");
        var now = DateTimeOffset.UtcNow;
        foreach (var (user, password) in legacy)
        {
            var account = new StoredAccount(user, true, now, now, null, null, password);
            ValidateStored(account); _accounts.Add(user, account);
        }
        File.Copy(_path, _path + ".legacy-" + now.ToString("yyyyMMddTHHmmssfffffff") + ".bak", false);
        Persist(_accounts);
    }
    private static void ValidateStored(StoredAccount account)
    {
        VpnValidation.Username(account.Username);
        if (account.Password is null || account.Password.Iterations is < 100_000 or > 2_000_000)
            throw new InvalidDataException("Invalid password record; original store retained.");
        if (Convert.FromBase64String(account.Password.Salt).Length < 16 || Convert.FromBase64String(account.Password.Hash).Length != 32)
            throw new InvalidDataException("Invalid password record; original store retained.");
    }
    private void Persist(Dictionary<string, StoredAccount> next)
    {
        var temporary = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                JsonSerializer.Serialize(file, new Document(1, next.Values.OrderBy(a => a.Username).ToList()), Json);
                file.Flush(true);
            }
            if (File.Exists(_path)) File.Replace(temporary, _path, null); else File.Move(temporary, _path);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public IReadOnlyList<AccountInfo> List() { lock (_gate) return _accounts.Values.OrderBy(a => a.Username).Select(a => a.Public()).ToArray(); }
    public StoredAccount? Find(string username) { lock (_gate) return _accounts.GetValueOrDefault(username); }
    public void Put(StoredAccount account)
    {
        lock (_gate)
        {
            var next = new Dictionary<string, StoredAccount>(_accounts, StringComparer.Ordinal) { [account.Username] = account };
            Persist(next); _accounts = next;
        }
    }
    public void Delete(string username)
    {
        lock (_gate)
        {
            var next = new Dictionary<string, StoredAccount>(_accounts, StringComparer.Ordinal);
            next.Remove(username); Persist(next); _accounts = next;
        }
    }
    public void Dispose() => _ownership.Dispose();
}
