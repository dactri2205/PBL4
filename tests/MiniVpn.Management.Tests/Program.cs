using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.FileProviders;
using MiniVpn.Common;
using MiniVpn.Management;
using MiniVpn.InternalWeb.VpnAdmin;
using MiniVpn.Server.Runtime;

var repository = new DirectoryInfo(AppContext.BaseDirectory);
while (repository is not null && !File.Exists(Path.Combine(repository.FullName, "MiniVpn.sln"))) repository = repository.Parent;
var temp = Path.Combine(repository!.FullName, ".dotnet", "management-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
var passed = 0;
async Task Test(string name, Func<Task> action) { await action(); Console.WriteLine("PASS " + name); passed++; }
void Check(bool condition, string message = "Assertion failed") { if (!condition) throw new Exception(message); }
async Task Eventually(Func<bool> condition, int milliseconds = 5000)
{
    var watch = Stopwatch.StartNew();
    while (!condition()) { if (watch.ElapsedMilliseconds > milliseconds) throw new Exception("Condition timed out"); await Task.Delay(20); }
}
var context = new OperationContext("test-admin", Guid.NewGuid().ToString("N"));
const string password = "test-password-private-123";
var path = Path.Combine(temp, "accounts.json");
var original = JsonSerializer.Serialize(new Dictionary<string, PasswordRecord> { ["alice"] = Passwords.Create(password), ["bob"] = Passwords.Create(password) });
await File.WriteAllTextAsync(path, original);
using var store = new FileAccountStore(path);
var options = new ManagementOptions { StateDirectory = temp, SampleSeconds = 2, AlertCooldownSeconds = 5 };
var audit = new JsonLineAuditStore(options.AuditDirectory);
var sessions = new VpnSessionManager(audit);
var notifier = new TestNotifier();
var history = new AlertHistory(options.AlertDirectory);
using var alerts = new AlertService(notifier, history, audit, options);
var service = new VpnManagementService(store, sessions, audit, alerts);

await Test("client TLS accepts a freshly issued pinned certificate and rejects expired, future and wrong-pin certificates", ClientCertificateTests.RunAsync);

await Test("legacy migration preserves accounts, PBKDF credentials and exact backup; ownership lock rejects a second writer", () =>
{
    Check(store.List().Count == 2 && Passwords.Verify(password, store.Find("alice")!.Password));
    var backup = Directory.GetFiles(temp, "accounts.json.legacy-*.bak").Single();
    Check(File.ReadAllText(backup) == original);
    using var doc = JsonDocument.Parse(File.ReadAllText(path)); Check(doc.RootElement.GetProperty("schemaVersion").GetInt32() == 1);
    try { using var duplicate = new FileAccountStore(path); throw new Exception("Lock bypassed"); } catch (VpnException ex) { Check(ex.Status == 409); }
    var unknown = Path.Combine(temp, "unknown-schema.json"); File.WriteAllText(unknown, "{\"schemaVersion\":2,\"accounts\":[]}");
    try { using var rejected = new FileAccountStore(unknown); throw new Exception("Unknown schema accepted"); } catch (InvalidDataException) { }
    Check(File.ReadAllText(unknown) == "{\"schemaVersion\":2,\"accounts\":[]}");
    return Task.CompletedTask;
});
await Test("create/disable/enable/reset/delete persist, revoke sessions, keep VPN identities independent and never serialize credentials", async () =>
{
    await service.CreateAsync(new("carol", password, "test", "external-42"), context);
    var closed = false;
    var session = await service.LoginAsync("carol", password, "127.0.0.2", () => closed = true, default);
    Check(session is not null);
    await service.SetEnabledAsync("carol", false, context);
    var snapshot = Path.Combine(temp, "reopen.json"); File.Copy(path, snapshot);
    using (var reopened = new FileAccountStore(snapshot)) Check(!reopened.Find("carol")!.Enabled && reopened.Find("carol")!.ExternalUserId == "external-42");
    Check(closed && session!.Cancellation.IsCancellationRequested);
    Check(await service.LoginAsync("carol", password, "127.0.0.3", () => { }, default) is null);
    await service.SetEnabledAsync("carol", true, context);
    Check(sessions.List().Count(s => !s.Closing && s.Username == "carol") == 0);
    sessions.Complete(session!, "test");
    var next = await service.LoginAsync("carol", password, "127.0.0.4", () => { }, default);
    await service.ResetPasswordAsync("carol", password + "-new", context);
    Check(next!.Closing && !Passwords.Verify(password, store.Find("carol")!.Password));
    sessions.Complete(next, "test");
    await service.DeleteAsync("carol", context); Check(store.Find("carol") is null);
    var json = JsonSerializer.Serialize(service.Accounts()).ToLowerInvariant();
    Check(!json.Contains("hash") && !json.Contains("salt") && !json.Contains("password"));
});
await Test("login/disable race cannot register a live session after disable; leases are not reused until completion", async () =>
{
    await service.CreateAsync(new("race", password), context);
    var work = Enumerable.Range(1, 12).Select(n => Task.Run(() => service.LoginAsync("race", password, "192.0.2." + n, () => { }, default))).ToArray();
    var disable = Task.Run(() => service.SetEnabledAsync("race", false, context));
    var results = await Task.WhenAll(work); await disable;
    Check(sessions.List().Where(s => s.Username == "race").All(s => s.Closing));
    Check(await service.LoginAsync("race", password, "192.0.2.200", () => { }, default) is null);
    var tombstones = results.Where(s => s is not null).Cast<VpnSession>().ToArray();
    if (tombstones.Length > 0)
    {
        var probe = sessions.Create("bob", "127.0.0.1", () => { });
        Check(tombstones.All(s => s.VpnIp != probe.VpnIp)); sessions.Complete(probe, "test");
    }
    foreach (var session in tombstones) sessions.Complete(session, "test");
    var reused = sessions.Create("bob", "127.0.0.1", () => { }); Check(reused.VpnIp == "10.8.0.2"); sessions.Complete(reused, "test");
});
await Test("audit UTC JSONL, filtering, pagination, validation, input normalization and retention", () =>
{
    for (var n = 0; n < 7; n++) audit.Write("filter-test", n % 2 == 0 ? "success" : "failure", context, "safe\r\nline", "alice");
    var page = audit.Query(new(Username: "alice", EventType: "filter-test", Outcome: "success", Page: 2, PageSize: 2));
    Check(page.Total == 4 && page.Items.Count == 2 && page.Items.All(x => x.Timestamp.Offset == TimeSpan.Zero && !x.Message.Contains('\n')));
    try { audit.Query(new(PageSize: 101)); throw new Exception("Unbounded query accepted"); } catch (VpnException ex) { Check(ex.Status == 400); }
    try { audit.Query(new(From: DateTimeOffset.UtcNow.AddDays(-40))); throw new Exception("Unbounded range accepted"); } catch (VpnException) { }
    var raw = string.Join("", Directory.GetFiles(options.AuditDirectory).Select(File.ReadAllText));
    Check(!raw.Contains(password) && !raw.Contains(store.Find("alice")!.Password.Hash) && !raw.Contains(store.Find("alice")!.Password.Salt));
    var expired = Path.Combine(options.AuditDirectory, "2000-01-01.jsonl"); File.WriteAllText(expired, "{}"); audit.Prune(); Check(!File.Exists(expired));
    return Task.CompletedTask;
});
await Test("notification cooldown, bounded retries, failed delivery history and continued VPN account operations", async () =>
{
    await alerts.StartAsync(default); notifier.Fail = true;
    Check(alerts.Publish("same", "warning", "test", "safe notification"));
    Check(!alerts.Publish("same", "warning", "test", "duplicate"));
    await Eventually(() => history.Recent().Any(a => a.EventType == "test" && a.DeliveryStatus == "failed"), 10000);
    Check(notifier.Attempts == 3);
    await service.CreateAsync(new("after_alert", password), context);
    Check(store.Find("after_alert") is not null);
    notifier.Fail = false;
    await Task.Delay(2100); // retry sequence consumed ~3 sec; cooldown is five seconds
    Check(alerts.Publish("same", "warning", "recovery", "recovered"));
    await Eventually(() => history.Recent().Any(a => a.EventType == "recovery" && a.DeliveryStatus == "sent"));
});
await Test("watchdog distinguishes crash, stale heartbeat, healthy VPN and intentional shutdown", () =>
{
    var now = DateTimeOffset.UtcNow; var stamp = new RuntimeStamp("running", now.AddMinutes(-1), now, 123);
    Check(WatchdogPolicy.Evaluate(true, stamp, stamp, now, TimeSpan.FromSeconds(20)) == "healthy");
    Check(WatchdogPolicy.Evaluate(false, null, stamp, now, TimeSpan.FromSeconds(20)) == "failure");
    Check(WatchdogPolicy.Evaluate(true, stamp with { Heartbeat = now.AddMinutes(-1) }, stamp, now, TimeSpan.FromSeconds(20)) == "failure");
    Check(WatchdogPolicy.Evaluate(false, null, stamp with { Status = "stopped" }, now, TimeSpan.FromSeconds(20)) == "intentional-stop");
    return Task.CompletedTask;
});

// Real TLS and TCP sockets, with only the Windows packet adapter and VPN-address listener
// replaced. This does not claim to test Wintun routing or a two-laptop VPN tunnel.
using var rsa = RSA.Create(2048);
var certRequest = new CertificateRequest("CN=MiniVpnTest", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
using var generated = certRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
using var certificate = X509CertificateLoader.LoadPkcs12(generated.Export(X509ContentType.Pfx, "test-cert"), "test-cert", X509KeyStorageFlags.UserKeySet);
var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
var tunnelPort = FreePort();
var controlBuilder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development", Args = [] });
controlBuilder.Logging.ClearProviders();
controlBuilder.WebHost.ConfigureKestrel(k => { k.Listen(IPAddress.Loopback, 0); k.Limits.MaxRequestBodySize = 16384; });
var runtimeDirectory = Path.Combine(temp, "runtime-host");
var runtimeAccountPath = Path.Combine(runtimeDirectory, "accounts.json");
var runtimeOptions = new ManagementOptions { StateDirectory = runtimeDirectory, SampleSeconds = 2 };
controlBuilder.Services.AddVpnManagement(runtimeOptions, runtimeAccountPath);
controlBuilder.Services.AddSingleton<IAlertNotifier>(new DisabledNotifier());
controlBuilder.Services.AddSingleton(new TunnelOptions(IPAddress.Loopback, tunnelPort, certificate));
controlBuilder.Services.AddSingleton<ITunnelDevice, TestDevice>();
controlBuilder.Services.AddSingleton<IVpnWebRelay, TestRelay>();
controlBuilder.Services.AddHostedService<TunnelServer>();
await using var control = controlBuilder.Build();
control.UseVpnErrors(); control.MapVpnControl(token);
var runtimeService = control.Services.GetRequiredService<VpnManagementService>();
await runtimeService.CreateAsync(new("live_alice", password), context);
await runtimeService.CreateAsync(new("live_bob", password), context);
await runtimeService.CreateAsync(new("unicode_user", new string('\u0111', 100)), context);
await control.StartAsync();
await Eventually(() => control.Services.GetRequiredService<VpnRuntimeState>().Status == "running");
var controlUrl = control.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
var controlPort = new Uri(controlUrl).Port;
using var controlHttp = new HttpClient(new HttpClientHandler { UseProxy = false }) { BaseAddress = new Uri(controlUrl) };

await Test("control API requires the service token and is bound only to loopback", async () =>
{
    Check((await controlHttp.GetAsync("/control/accounts")).StatusCode == HttpStatusCode.Unauthorized);
    controlHttp.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    Check((await controlHttp.GetAsync("/control/accounts")).IsSuccessStatusCode);
    Check(new Uri(controlUrl).Host == "127.0.0.1");
});
await Test("real TLS session revocation closes tunnel AND attached TCP relay, preserves another client, counts payload and reuses IP safely", async () =>
{
    await using (var unicode = await TestTunnel.ConnectAsync(tunnelPort, "unicode_user", new string('\u0111', 100), certificate))
    { Check(!string.IsNullOrEmpty(unicode.Address)); }
    await Eventually(() => control.Services.GetRequiredService<IVpnSessionManager>().List().All(s => s.Username != "unicode_user"));
    await using var alice = await TestTunnel.ConnectAsync(tunnelPort, "live_alice", password, certificate);
    await using var bob = await TestTunnel.ConnectAsync(tunnelPort, "live_bob", password, certificate);
    var manager = control.Services.GetRequiredService<IVpnSessionManager>();
    var aliceSession = manager.FindByIp(alice.Address)!;
    var socketListener = new TcpListener(IPAddress.Loopback, 0); socketListener.Start();
    using var relayClient = new TcpClient();
    await relayClient.ConnectAsync(IPAddress.Loopback, ((IPEndPoint)socketListener.LocalEndpoint).Port);
    using var relayPeer = await socketListener.AcceptTcpClientAsync();
    using var backendClient = new TcpClient();
    Check(aliceSession.AttachRelay(relayPeer, backendClient));
    await bob.SendPacketAsync();
    await Eventually(() => manager.ReceivedBytes >= 40);
    await runtimeService.SetEnabledAsync("live_alice", false, context);
    Check(await alice.ClosedAsync());
    using var relayTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
    Check(await relayClient.GetStream().ReadAsync(new byte[1], relayTimeout.Token) == 0);
    await Eventually(() => manager.FindByIp(alice.Address) is null && manager.List().All(s => s.Username != "live_alice"));
    Check(manager.FindByIp(bob.Address) is not null);
    await bob.SendPacketAsync(); await Eventually(() => manager.ReceivedBytes >= 80);
    Check(await TestTunnel.DeniedAsync(tunnelPort, "live_alice", password, certificate));
    await runtimeService.SetEnabledAsync("live_alice", true, context);
    await using var again = await TestTunnel.ConnectAsync(tunnelPort, "live_alice", password, certificate);
    Check(again.Address == alice.Address && again.Address != bob.Address);
    socketListener.Stop();
});
await Test("CLI online writes go through the same runtime; missing token/offline concurrent writer is refused", async () =>
{
    var serverDll = Path.Combine(repository.FullName, "src/MiniVpn.Server/bin/Release/net10.0-windows/MiniVpn.Server.dll");
    var start = new ProcessStartInfo("dotnet") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = repository.FullName };
    foreach (var arg in new[] { serverDll, "disable-user", runtimeAccountPath, "live_bob" }) start.ArgumentList.Add(arg);
    start.Environment["MINIVPN_CONTROL_TOKEN"] = token;
    start.Environment["VpnManagement__ControlPort"] = controlPort.ToString();
    start.Environment["MINIVPN_CONFIG"] = "";
    using var online = Process.Start(start)!;
    var onlineOutput = online.StandardOutput.ReadToEndAsync(); var onlineError = online.StandardError.ReadToEndAsync();
    await online.WaitForExitAsync(); await onlineOutput; await onlineError; Check(online.ExitCode == 0 && !runtimeService.Accounts().Single(a => a.Username == "live_bob").Enabled);
    start.Environment.Remove("MINIVPN_CONTROL_TOKEN");
    using var offline = Process.Start(start)!;
    var output = offline.StandardOutput.ReadToEndAsync(); var error = offline.StandardError.ReadToEndAsync();
    await offline.WaitForExitAsync(); await output;
    Check(offline.ExitCode != 0 && (await error).Contains("store_in_use"));
});

Environment.SetEnvironmentVariable("MINIVPN_ADMIN_PASSWORD", password);
Environment.SetEnvironmentVariable("MINIVPN_CONTROL_TOKEN", token);
var gatewayBuilder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development", Args = [] });
gatewayBuilder.Logging.ClearProviders(); gatewayBuilder.WebHost.ConfigureKestrel(k => { k.Listen(IPAddress.Loopback, 0); k.Limits.MaxRequestBodySize = 16384; });
gatewayBuilder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
    ["VpnAdmin:AuthenticationMode"] = "Temporary", ["VpnAdmin:TemporaryLoginEnabled"] = "true", ["VpnAdmin:AllowInsecureHttpDevelopment"] = "true", ["VpnAdmin:ControlPort"] = controlPort.ToString()
});
var adminOptions = VpnAdminOptions.Read(gatewayBuilder.Configuration, gatewayBuilder.Environment);
gatewayBuilder.Services.AddVpnAdmin(adminOptions);
var authorizer = new TestAuthorizer(); gatewayBuilder.Services.AddSingleton<IVpnAdminAuthorizer>(authorizer);
await using var gateway = gatewayBuilder.Build(); gateway.UseVpnErrors(); gateway.MapVpnGateway();
gateway.UseDefaultFiles(new Microsoft.AspNetCore.Builder.DefaultFilesOptions { FileProvider = new PhysicalFileProvider(Path.Combine(repository.FullName, "webnew/frontend")) });
gateway.UseStaticFiles(new Microsoft.AspNetCore.Builder.StaticFileOptions { FileProvider = new PhysicalFileProvider(Path.Combine(repository.FullName, "webnew/frontend")) });
await gateway.StartAsync();
var gatewayUrl = gateway.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
var cookies = new CookieContainer();
using var browser = new HttpClient(new HttpClientHandler { CookieContainer = cookies, UseProxy = false, AllowAutoRedirect = false }) { BaseAddress = new Uri(gatewayUrl) };
async Task<string> Csrf()
{
    using var response = await browser.GetAsync("/api/vpn/auth/session"); Check(response.IsSuccessStatusCode);
    using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    return doc.RootElement.GetProperty("csrfToken").GetString()!;
}
await Test("gateway ignores forged browser roles, rejects unauthenticated API, CSRF failures and authenticated non-admins", async () =>
{
    browser.DefaultRequestHeaders.Add("X-Role", "ADMIN"); browser.DefaultRequestHeaders.Add("X-Vpn-Actor", "forged-admin");
    Check((await browser.GetAsync("/api/vpn/accounts?demo=1&role=ADMIN")).StatusCode == HttpStatusCode.Unauthorized);
    using var noCsrf = await browser.PostAsJsonAsync("/api/vpn/auth/login", new { username = "vpn-admin", password });
    Check(noCsrf.StatusCode == HttpStatusCode.BadRequest);
    browser.DefaultRequestHeaders.Add("X-CSRF-Token", await Csrf());
    Check((await browser.PostAsJsonAsync("/api/vpn/auth/login", new { username = "vpn-admin", password })).IsSuccessStatusCode);
    browser.DefaultRequestHeaders.Remove("X-CSRF-Token"); browser.DefaultRequestHeaders.Add("X-CSRF-Token", await Csrf());
    var sessionCookies = cookies.GetCookies(new Uri(gatewayUrl + "/api/vpn")).Cast<Cookie>().ToArray();
    Check(sessionCookies.Single(c => c.Name == "MiniVpn.Admin").HttpOnly);
    authorizer.Deny = true;
    Check((await browser.GetAsync("/api/vpn/accounts")).StatusCode == HttpStatusCode.Forbidden);
    authorizer.Deny = false;
    browser.DefaultRequestHeaders.Remove("X-CSRF-Token");
    Check((await browser.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount("missing_csrf", password))).StatusCode == HttpStatusCode.BadRequest);
    browser.DefaultRequestHeaders.Add("X-CSRF-Token", await Csrf());
});
await Test("gateway API DTO validation, account CRUD, logs, metrics, alert masking and protected routing", async () =>
{
    Check((await browser.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount("bad-name", password))).StatusCode == HttpStatusCode.BadRequest);
    Check((await browser.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount("web_user", "short"))).StatusCode == HttpStatusCode.BadRequest);
    Check((await browser.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount("web_user", password))).StatusCode == HttpStatusCode.Created);
    Check((await browser.PostAsJsonAsync("/api/vpn/accounts", new CreateAccount("web_user", password))).StatusCode == HttpStatusCode.Conflict);
    using var malformed = await browser.PostAsync("/api/vpn/accounts", new StringContent("{bad-json", System.Text.Encoding.UTF8, "application/json"));
    Check(malformed.StatusCode == HttpStatusCode.BadRequest && (await malformed.Content.ReadAsStringAsync()).Contains("correlationId"));
    using var unsupported = await browser.PostAsync("/api/vpn/accounts", new StringContent("not json")); Check(unsupported.StatusCode == HttpStatusCode.UnsupportedMediaType);
    using var oversized = await browser.PostAsync("/api/vpn/accounts", new StringContent(new string('x', 17000), System.Text.Encoding.UTF8, "application/json"));
    Check(oversized.StatusCode == HttpStatusCode.RequestEntityTooLarge);
    Check((await browser.PostAsync("/api/vpn/accounts/web_user/disable", null)).IsSuccessStatusCode);
    Check((await browser.PostAsync("/api/vpn/accounts/web_user/enable", null)).IsSuccessStatusCode);
    Check((await browser.PostAsJsonAsync("/api/vpn/accounts/web_user/password", new ResetPassword(password + "2"))).StatusCode == HttpStatusCode.NoContent);
    var list = await browser.GetStringAsync("/api/vpn/accounts"); Check(!list.Contains("password", StringComparison.OrdinalIgnoreCase) && !list.Contains("salt", StringComparison.OrdinalIgnoreCase));
    Check((await browser.GetAsync("/api/vpn/logs?pageSize=101")).StatusCode == HttpStatusCode.BadRequest);
    var logs = await browser.GetStringAsync("/api/vpn/logs?username=web_user&eventType=account-created&pageSize=5");
    Check(logs.Contains("vpn-admin") && !logs.Contains("forged-admin") && !logs.Contains(password));
    Check((await browser.GetAsync("/api/vpn/overview")).IsSuccessStatusCode);
    Check((await browser.GetAsync("/api/vpn/metrics")).IsSuccessStatusCode);
    var alertConfiguration = await browser.GetStringAsync("/api/vpn/alerts"); Check(!alertConfiguration.Contains(token) && !alertConfiguration.Contains("webhook", StringComparison.OrdinalIgnoreCase));
    Check((await browser.GetAsync("/api/vpn/store")).StatusCode == HttpStatusCode.NotFound);
    Check((await browser.DeleteAsync("/api/vpn/accounts/web_user")).StatusCode == HttpStatusCode.NoContent);
});
await Test("logout invalidates server session, login is rate limited and Production refuses insecure development configuration", async () =>
{
    var replay = cookies.GetCookies(new Uri(gatewayUrl + "/api/vpn")).Cast<Cookie>().Single(c => c.Name == "MiniVpn.Admin").Value;
    Check((await browser.PostAsync("/api/vpn/auth/logout", null)).StatusCode == HttpStatusCode.NoContent);
    cookies.Add(new Uri(gatewayUrl), new Cookie("MiniVpn.Admin", replay, "/api/vpn"));
    Check((await browser.GetAsync("/api/vpn/accounts")).StatusCode == HttpStatusCode.Unauthorized);
    browser.DefaultRequestHeaders.Remove("X-CSRF-Token"); browser.DefaultRequestHeaders.Add("X-CSRF-Token", await Csrf());
    HttpResponseMessage? response = null;
    for (var n = 0; n < 6; n++) { response?.Dispose(); response = await browser.PostAsJsonAsync("/api/vpn/auth/login", new { username = "vpn-admin", password = "wrong" }); }
    Check(response!.StatusCode == HttpStatusCode.TooManyRequests); response.Dispose();
    var production = new FakeEnvironment { EnvironmentName = "Production" };
    try { VpnAdminOptions.Read(gatewayBuilder.Configuration, production); throw new Exception("Insecure production accepted"); } catch (InvalidOperationException) { }
    var defaultOptions = VpnAdminOptions.Read(new ConfigurationBuilder().Build(), production); Check(!defaultOptions.TemporaryLoginEnabled);
});
if (Environment.GetEnvironmentVariable("MINIVPN_BROWSER_TEST") == "1")
{
    await Test("Chrome dashboard integration against disposable real API host", async () =>
    {
        gateway.Services.GetRequiredService<AttemptLimiter>().Reset("127.0.0.1");
        var start = new ProcessStartInfo("node") { WorkingDirectory = Path.Combine(repository.FullName, "webnew"), RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add("tools/vpn-browser-smoke.mjs"); start.Environment["PREVIEW_URL"] = gatewayUrl + "/";
        using var process = Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        try { await process.WaitForExitAsync(timeout.Token); } catch { process.Kill(true); throw; }
        Console.Write(await output); var diagnostic = await error;
        if (process.ExitCode != 0) throw new Exception("Browser integration failed: " + diagnostic);
    });
}
if (Environment.GetEnvironmentVariable("MINIVPN_FULL_STACK_TEST") == "1")
{
    await Test("merged portal Node/PostgreSQL and VPN integration", () =>
        PortalIntegrationTests.RunAsync(repository.FullName, controlPort, token, tunnelPort, certificate));
}
await control.StopAsync();
await Test("gateway reports VPN offline without fabricating metrics or using mock data", async () =>
{
    // A fresh client bypasses the exhausted login bucket only by directly testing the
    // authenticated control-client boundary; it does not bypass gateway authorization.
    var client = gateway.Services.GetRequiredService<VpnControlClient>();
    var httpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext(); httpContext.Request.Method = "GET";
    try { await client.ForwardAsync(httpContext, "overview"); throw new Exception("Offline control accepted"); }
    catch (VpnException ex) { Check(ex.Status == 503 && ex.Code == "vpn_offline"); }
});
await gateway.StopAsync(); await alerts.StopAsync(default);
Console.WriteLine($"{passed} management checks passed. Wintun / VPN relay address / multi-laptop routing require manual verification.");

static int FreePort() { var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return port; }
sealed class TestNotifier : IAlertNotifier
{
    public bool Enabled => true; public string Provider => "Test"; public bool Fail; public int Attempts;
    public Task SendAsync(string text, CancellationToken ct) { Interlocked.Increment(ref Attempts); return Fail ? Task.FromException(new HttpRequestException("test failure")) : Task.CompletedTask; }
}
sealed class DisabledNotifier : IAlertNotifier
{ public bool Enabled => false; public string Provider => "Disabled"; public Task SendAsync(string text, CancellationToken ct) => Task.CompletedTask; }
sealed class TestDevice : ITunnelDevice
{
    public Task StartAsync(CancellationToken ct) => Task.CompletedTask;
    public byte[]? Receive(CancellationToken ct) { ct.WaitHandle.WaitOne(); return null; }
    public void Send(byte[] packet) { }
    public Task StopAsync() => Task.CompletedTask;
}
sealed class TestRelay : IVpnWebRelay
{
    private readonly TaskCompletionSource _completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task Completion => _completion.Task;
    public Task StartAsync(CancellationToken ct) => Task.CompletedTask;
    public Task StopAsync() { _completion.TrySetResult(); return Task.CompletedTask; }
}
sealed class TestAuthorizer : IVpnAdminAuthorizer
{ public bool Deny; public bool IsAdmin(ClaimsPrincipal principal) => !Deny && new VpnAdminAuthorizer().IsAdmin(principal); }
sealed class FakeEnvironment : IHostEnvironment
{
    public string EnvironmentName { get; set; } = "Production"; public string ApplicationName { get; set; } = "Tests";
    public string ContentRootPath { get; set; } = ".";
    public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
}
sealed class TestTunnel(TcpClient tcp, SslStream tls, string address) : IAsyncDisposable
{
    public string Address { get; } = address;
    private static async Task<(TcpClient, SslStream, Frame)> Login(int port, string username, string password, X509Certificate2 cert)
    {
        var tcp = new TcpClient(); await tcp.ConnectAsync(IPAddress.Loopback, port);
        var fingerprint = SHA256.HashData(cert.RawData);
        var tls = new SslStream(tcp.GetStream(), false, (_, remote, _, _) => remote is not null && CryptographicOperations.FixedTimeEquals(fingerprint, SHA256.HashData(remote.GetRawCertData())));
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions { TargetHost = "MiniVpnTest", EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13 }, timeout.Token);
        await Protocol.WriteAsync(tls, FrameType.Login, Protocol.Json(new Login(username, password)), timeout.Token);
        return (tcp, tls, await Protocol.ReadAsync(tls, timeout.Token));
    }
    public static async Task<TestTunnel> ConnectAsync(int port, string username, string password, X509Certificate2 cert)
    { var (tcp, tls, frame) = await Login(port, username, password, cert); if (frame.Type != FrameType.Welcome) throw new Exception("Expected welcome"); return new(tcp, tls, Protocol.Parse<Welcome>(frame.Data).Address); }
    public static async Task<bool> DeniedAsync(int port, string username, string password, X509Certificate2 cert)
    { var (tcp, tls, frame) = await Login(port, username, password, cert); using (tcp) using (tls) return frame.Type == FrameType.Denied; }
    public async Task SendPacketAsync()
    {
        var packet = new byte[40]; packet[0] = 0x45; packet[9] = 6;
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(2), 40);
        IpPolicy.Ip(Address).CopyTo(packet, 12); IpPolicy.Ip("10.8.0.1").CopyTo(packet, 16);
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(22), 8080);
        await Protocol.WriteAsync(tls, FrameType.Packet, packet, default);
    }
    public async Task<bool> ClosedAsync()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try { return await tls.ReadAsync(new byte[1], timeout.Token) == 0; }
        catch (IOException) { return true; }
    }
    public async ValueTask DisposeAsync() { await tls.DisposeAsync(); tcp.Dispose(); }
}
