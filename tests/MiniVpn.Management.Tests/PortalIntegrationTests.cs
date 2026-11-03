using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using MiniVpn.InternalWeb.VpnAdmin;
using MiniVpn.Management;

static class PortalIntegrationTests
{
    private static void Check(bool value, string detail) { if (!value) throw new Exception("Portal integration: " + detail); }
    public static async Task RunAsync(string root, int controlPort, string token, int tunnelPort, X509Certificate2 certificate)
    {
        await using var fixture = await PortalFixture.StartAsync(root);
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development", Args = [] });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(k => { k.Listen(IPAddress.Loopback, 0, listener => listener.UseHttps(certificate)); k.Limits.MaxRequestBodySize = 16384; });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["VpnAdmin:AuthenticationMode"] = "Portal", ["VpnAdmin:AllowInsecureHttpDevelopment"] = "false",
            ["VpnAdmin:ControlPort"] = controlPort.ToString(), ["Portal:ApiBaseUrl"] = $"http://127.0.0.1:{fixture.Port}/"
        });
        builder.Services.AddSingleton(PortalBackendOptions.Read(builder.Configuration));
        builder.Services.AddVpnAdmin(VpnAdminOptions.Read(builder.Configuration, builder.Environment));
        await using var gateway = builder.Build(); gateway.UseVpnErrors(); gateway.MapVpnGateway();
        using var files = new PhysicalFileProvider(Path.Combine(root, "webnew/frontend"));
        gateway.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        gateway.UseStaticFiles(new StaticFileOptions { FileProvider = files });
        await gateway.StartAsync();
        var url = gateway.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var adminCookies = new CookieContainer();
        using var anonymous = Browser(url, certificate); using var admin = Browser(url, certificate, adminCookies);
        using var employee = Browser(url, certificate); using var second = Browser(url, certificate);

        Check((await anonymous.GetAsync("/")).IsSuccessStatusCode, "merged home serves");
        Check((await anonymous.GetAsync("/vpn-admin.html")).IsSuccessStatusCode, "dashboard copied to merged frontend");
        Check((await anonymous.GetAsync("/assets/js/services/vpn-api.js")).IsSuccessStatusCode, "VPN adapter asset serves");
        Check((await anonymous.GetAsync("/healthz")).IsSuccessStatusCode, "health includes real Node/PostgreSQL readiness");
        anonymous.DefaultRequestHeaders.Add("X-Role", "ADMIN"); anonymous.DefaultRequestHeaders.Add("X-Vpn-Actor", "spoofed");
        await Status(anonymous.GetAsync("/api/vpn/accounts?demo=1&role=ADMIN"), HttpStatusCode.Unauthorized, "anonymous fake role denied");
        await Status(anonymous.PostAsJsonAsync("/api/auth/login", new { username = "hoangan", password = "wrong" }), HttpStatusCode.Unauthorized, "real login rejects wrong password");
        await Login(admin, "hoangan", fixture.AdminPassword); await Login(employee, "quangminh", fixture.EmployeePassword); await Login(second, "integration_admin", fixture.AdminPassword);
        Check(adminCookies.GetCookies(new Uri(url)).Cast<Cookie>().Single(c => c.Name == "__Host-avsid") is { Secure: true, HttpOnly: true }, "HTTPS uses secure HttpOnly portal cookie");
        Check((await Session(admin)).GetProperty("isAdmin").GetBoolean(), "real website ADMIN receives VPN permission");
        Check(!(await Session(employee)).GetProperty("isAdmin").GetBoolean(), "website EMPLOYEE has no VPN permission");
        await Status(employee.GetAsync("/api/vpn/accounts"), HttpStatusCode.Forbidden, "employee VPN access denied");
        await Status(employee.GetAsync("/api/admin/users"), HttpStatusCode.Forbidden, "employee website admin denied");
        await Status(employee.GetAsync("/api/tasks/t5"), HttpStatusCode.NotFound, "employee cannot view another assignee's work");
        Check((await employee.GetAsync("/api/tasks")).IsSuccessStatusCode, "personal tasks work after merge");
        Check((await employee.GetAsync("/api/department")).IsSuccessStatusCode, "department API preserved");
        Check((await employee.PostAsync("/api/notifications/read-all", null)).IsSuccessStatusCode, "notification update preserved");
        Check((await admin.GetAsync("/api/directory")).IsSuccessStatusCode, "directory API preserved");
        Console.WriteLine("PASS portal same-origin routing, real login, ADMIN/EMPLOYEE permissions and existing business APIs");

        const string vpnName = "merged_vpn";
        await Status(admin.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount(vpnName, fixture.AdminPassword)), HttpStatusCode.BadRequest, "VPN writes still require CSRF");
        await Csrf(admin);
        await Status(admin.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount(vpnName, fixture.AdminPassword, "merged integration", "admin")), HttpStatusCode.Created, "portal creates VPN account");
        await using (var live = await TestTunnel.ConnectAsync(tunnelPort, vpnName, fixture.AdminPassword, certificate))
        {
            var list = await JsonResponse(admin.GetAsync("/api/vpn/sessions"));
            var sessionId = list.EnumerateArray().Single(s => s.GetProperty("username").GetString() == vpnName).GetProperty("sessionId").GetString();
            Check((await admin.PostAsync($"/api/vpn/sessions/{sessionId}/disconnect", null)).IsSuccessStatusCode, "SSO admin disconnects runtime session");
            Check(await live.ClosedAsync(), "SSO operation closes actual TLS transport");
        }
        Check((await admin.PostAsync($"/api/vpn/accounts/{vpnName}/disable", null)).IsSuccessStatusCode, "disable VPN account");
        Check(await TestTunnel.DeniedAsync(tunnelPort, vpnName, fixture.AdminPassword, certificate), "disabled account cannot reconnect");
        Check((await admin.PostAsync($"/api/vpn/accounts/{vpnName}/enable", null)).IsSuccessStatusCode, "enable VPN account");
        await using (var live = await TestTunnel.ConnectAsync(tunnelPort, vpnName, fixture.AdminPassword, certificate))
        {
            await Status(admin.PostAsJsonAsync($"/api/vpn/accounts/{vpnName}/password", new ResetPassword(fixture.AdminPassword + "-new")), HttpStatusCode.NoContent, "reset VPN password");
            Check(await live.ClosedAsync(), "reset through SSO revokes actual session");
        }
        var logs = await JsonResponse(admin.GetAsync($"/api/vpn/logs?username={vpnName}&eventType=account-created"));
        Check(logs.GetProperty("items").EnumerateArray().Any(e => e.GetProperty("actor").GetString() == "admin"), "VPN audit uses trusted immutable website actor ID");
        Check((await admin.GetAsync("/api/vpn/alerts")).IsSuccessStatusCode, "alert history preserved");
        Check((await admin.GetAsync("/api/vpn/metrics")).IsSuccessStatusCode, "VPN metrics preserved");
        await Status(admin.DeleteAsync($"/api/vpn/accounts/{vpnName}"), HttpStatusCode.NoContent, "delete VPN account");
        Console.WriteLine("PASS portal ADMIN manages real VPN accounts, revokes live TLS sessions, queries audit/metrics/alerts with CSRF");

        async Task ChangeSecond(string role, string status) => await Status(admin.PatchAsJsonAsync("/api/admin/users/" + fixture.SecondId,
            new { name = "Integration Admin", role, status, departmentId = "it" }), HttpStatusCode.OK, "update real website role/status");
        await ChangeSecond("EMPLOYEE", "Active");
        await Status(second.GetAsync("/api/vpn/accounts"), HttpStatusCode.Unauthorized, "role downgrade invalidates previous admin session");
        await Login(second, "integration_admin", fixture.AdminPassword);
        await Status(second.GetAsync("/api/vpn/accounts"), HttpStatusCode.Forbidden, "downgraded identity stays forbidden after login");
        await ChangeSecond("ADMIN", "Active"); await Login(second, "integration_admin", fixture.AdminPassword);
        await fixture.CommandAsync("expire", new { userId = fixture.SecondId });
        await Status(second.GetAsync("/api/vpn/accounts"), HttpStatusCode.Unauthorized, "expired PostgreSQL session denied");
        await Login(second, "integration_admin", fixture.AdminPassword); await ChangeSecond("ADMIN", "Disabled");
        await Status(second.GetAsync("/api/vpn/accounts"), HttpStatusCode.Unauthorized, "disabled website admin loses VPN access immediately");
        await ChangeSecond("ADMIN", "Active");
        await Status(second.GetAsync("/api/vpn/accounts"), HttpStatusCode.Unauthorized, "reenable does not resurrect revoked website cookie");
        await Login(second, "integration_admin", fixture.AdminPassword);
        await fixture.CommandAsync("reset", new { username = "integration_admin" });
        await Status(second.GetAsync("/api/vpn/accounts"), HttpStatusCode.Unauthorized, "CLI website password reset revokes VPN admin identity");
        Check((await fixture.CommandAsync("race", new { })).GetBoolean(), "stale password authentication cannot issue a new session after reset");
        await Login(employee, "quangminh", fixture.EmployeePassword);
        await Status(employee.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = fixture.EmployeePassword, newPassword = fixture.EmployeePassword + "-changed" }), HttpStatusCode.OK, "self-service website password change");
        await Status(employee.GetAsync("/api/me"), HttpStatusCode.Unauthorized, "password change ends website session");
        await Login(employee, "quangminh", fixture.EmployeePassword + "-changed");
        Console.WriteLine("PASS real PostgreSQL session expiry, role/status changes, password reset and login/revocation race");

        if (Environment.GetEnvironmentVariable("MINIVPN_BROWSER_TEST") == "1")
        {
            var start = new ProcessStartInfo("node") { WorkingDirectory = Path.Combine(root, "webnew"), RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
            start.ArgumentList.Add("tools/vpn-browser-smoke.mjs"); start.Environment["PREVIEW_URL"] = url + "/";
            start.Environment["MINIVPN_BROWSER_PORTAL"] = "1"; start.Environment["MINIVPN_ADMIN_USERNAME"] = "hoangan"; start.Environment["MINIVPN_ADMIN_PASSWORD"] = fixture.AdminPassword;
            using var publicKey = certificate.GetRSAPublicKey()!;
            start.Environment["MINIVPN_BROWSER_CERT_SPKI"] = Convert.ToBase64String(SHA256.HashData(publicKey.ExportSubjectPublicKeyInfo()));
            using var process = Process.Start(start)!; var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            try { await process.WaitForExitAsync(timeout.Token); } catch { process.Kill(true); throw; }
            Console.Write(await output); Check(process.ExitCode == 0, "Chrome merged portal: " + await error);
        }
        await Csrf(admin);
        var replayCookie = adminCookies.GetCookieHeader(new Uri(url + "/api/me"));
        await Status(admin.PostAsync("/api/vpn/auth/logout", null), HttpStatusCode.NoContent, "dashboard logout ends website session");
        await Status(admin.GetAsync("/api/me"), HttpStatusCode.Unauthorized, "website session ended by VPN logout");
        await Status(admin.GetAsync("/api/vpn/accounts"), HttpStatusCode.Unauthorized, "VPN session ended by shared logout");
        using (var replay = Browser(url, certificate))
        {
            replay.DefaultRequestHeaders.Add("Cookie", replayCookie);
            await Status(replay.GetAsync("/api/me"), HttpStatusCode.Unauthorized, "replaying old website cookie after logout fails at database");
        }
        await Login(second, "integration_admin", fixture.AdminPassword); await fixture.StopNodeAsync();
        await Status(second.GetAsync("/api/vpn/overview"), HttpStatusCode.ServiceUnavailable, "backend outage cannot retain stale ADMIN permission");
        await Status(anonymous.GetAsync("/healthz"), HttpStatusCode.ServiceUnavailable, "health reflects backend outage");
        Console.WriteLine("PASS shared logout, backend offline handling and real database migrations applied twice without duplication");
        await gateway.StopAsync();
    }
    private static HttpClient Browser(string url, X509Certificate2 certificate, CookieContainer? cookies = null)
    {
        var pinned = SHA256.HashData(certificate.RawData);
        var client = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false, CookieContainer = cookies ?? new CookieContainer(),
            ServerCertificateCustomValidationCallback = (_, remote, _, _) => remote is not null && CryptographicOperations.FixedTimeEquals(pinned, SHA256.HashData(remote.RawData)) }) { BaseAddress = new Uri(url), Timeout = TimeSpan.FromSeconds(15) };
        client.DefaultRequestHeaders.Add("Origin", url); return client;
    }
    private static async Task Login(HttpClient client, string username, string password) => await Status(client.PostAsJsonAsync("/api/auth/login", new { username, password }), HttpStatusCode.OK, "portal login: " + username);
    private static async Task<JsonElement> Session(HttpClient client) => await JsonResponse(client.GetAsync("/api/vpn/auth/session"));
    private static async Task Csrf(HttpClient client)
    {
        var session = await Session(client); client.DefaultRequestHeaders.Remove("X-CSRF-Token"); client.DefaultRequestHeaders.Add("X-CSRF-Token", session.GetProperty("csrfToken").GetString());
    }
    private static async Task Status(Task<HttpResponseMessage> pending, HttpStatusCode expected, string name)
    {
        using var response = await pending; Check(response.StatusCode == expected, name + ": " + (int)response.StatusCode + " " + await response.Content.ReadAsStringAsync());
    }
    private static async Task<JsonElement> JsonResponse(Task<HttpResponseMessage> pending)
    {
        using var response = await pending; response.EnsureSuccessStatusCode(); using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync()); return doc.RootElement.Clone();
    }
}

sealed class PortalFixture : IAsyncDisposable
{
    private readonly string _root, _name = "pbl4-merge-test-" + Guid.NewGuid().ToString("N");
    private readonly string _database = "pbl4_test_" + Guid.NewGuid().ToString("N");
    private readonly string _pgPassword = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> _pending = [];
    private readonly TaskCompletionSource<JsonElement> _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Process? _node; private bool _containerCreated;
    public string AdminPassword { get; } = "Pbl4-" + Guid.NewGuid().ToString("N");
    public string EmployeePassword { get; } = "Pbl4-" + Guid.NewGuid().ToString("N");
    public int Port { get; private set; }
    public string SecondId { get; private set; } = "";
    private PortalFixture(string root) => _root = root;
    public static async Task<PortalFixture> StartAsync(string root)
    {
        var value = new PortalFixture(root); try { await value.StartAsync(); return value; } catch { await value.DisposeAsync(); throw; }
    }
    private async Task StartAsync()
    {
        await Docker(["run", "-d", "--rm", "--name", _name, "--label", "pbl4.integration=true", "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB", "postgres:17-alpine"],
            new() { ["POSTGRES_PASSWORD"] = _pgPassword, ["POSTGRES_DB"] = _database });
        _containerCreated = true;
        var mapping = (await Docker(["port", _name, "5432/tcp"])).Trim(); var port = int.Parse(mapping[(mapping.LastIndexOf(':') + 1)..]);
        for (var attempt = 0; ; attempt++)
        {
            try { await Docker(["exec", _name, "pg_isready", "-U", "postgres", "-d", _database]); break; }
            catch when (attempt < 50) { await Task.Delay(300); }
        }
        var start = new ProcessStartInfo("node") { WorkingDirectory = Path.Combine(_root, "webnew"), RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add("tools/integration-backend.mjs"); start.Environment["MINIVPN_INTEGRATION_FIXTURE"] = "1"; start.Environment.Remove("MIGRATIONS_DIR");
        _node = Process.Start(start)!; var diagnostic = _node.StandardError.ReadToEndAsync();
        _ = Task.Run(async () =>
        {
            while (await _node.StandardOutput.ReadLineAsync() is { } line)
            {
                if (!line.StartsWith('{')) continue;
                using var document = JsonDocument.Parse(line); var item = document.RootElement.Clone();
                if (item.TryGetProperty("event", out var evt) && evt.GetString() == "ready") _ready.TrySetResult(item);
                else if (item.TryGetProperty("id", out var id) && _pending.TryRemove(id.GetString()!, out var completion))
                {
                    if (item.TryGetProperty("error", out var error)) completion.TrySetException(new Exception("Node fixture: " + error.GetString()));
                    else completion.TrySetResult(item.GetProperty("result").Clone());
                }
            }
            _ready.TrySetException(new Exception("Node fixture exited: " + await diagnostic));
        });
        await _node.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { port, database = _database, password = _pgPassword, adminPassword = AdminPassword, employeePassword = EmployeePassword }));
        var ready = await _ready.Task.WaitAsync(TimeSpan.FromSeconds(60)); Port = ready.GetProperty("port").GetInt32(); SecondId = ready.GetProperty("secondId").GetString()!;
    }
    public async Task<JsonElement> CommandAsync(string action, object data)
    {
        var id = Guid.NewGuid().ToString("N"); var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously); _pending[id] = completion;
        var payload = JsonSerializer.SerializeToElement(data); var values = payload.EnumerateObject().ToDictionary(p => p.Name, p => (object)p.Value.Clone()); values["id"] = id; values["action"] = action;
        await _node!.StandardInput.WriteLineAsync(JsonSerializer.Serialize(values)); return await completion.Task.WaitAsync(TimeSpan.FromSeconds(15));
    }
    public async Task StopNodeAsync()
    {
        if (_node is null || _node.HasExited) return; await CommandAsync("stop", new { }); await _node.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
    }
    public async ValueTask DisposeAsync()
    {
        if (_node is not null) { try { await StopNodeAsync(); } catch { if (!_node.HasExited) _node.Kill(true); } _node.Dispose(); }
        if (_containerCreated) { try { await Docker(["rm", "-f", _name]); } catch { } }
    }
    private static async Task<string> Docker(string[] args, Dictionary<string, string>? environment = null)
    {
        var start = new ProcessStartInfo("docker") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var arg in args) start.ArgumentList.Add(arg);
        if (environment is not null) foreach (var item in environment) start.Environment[item.Key] = item.Value;
        using var process = Process.Start(start)!; var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120)); try { await process.WaitForExitAsync(timeout.Token); } catch { process.Kill(true); throw; }
        if (process.ExitCode != 0) throw new Exception("Disposable PostgreSQL container command failed: " + await error); return await output;
    }
}
