using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using MiniVpn.Management;

namespace MiniVpn.Server;

public static class AccountCli
{
    public static bool IsCommand(string[] args) => args.Length > 0 && args[0] is "add-user" or "list-users" or "disable-user" or "enable-user" or "reset-password" or "delete-user" or "disconnect-user";
    public static async Task RunAsync(string[] args, ManagementOptions options)
    {
        if (args.Length < 2 || (args[0] != "list-users" && args.Length != 3)) throw new ArgumentException("Usage: <command> <accounts.json> [username]");
        var command = args[0]; var path = Path.GetFullPath(args[1]); var user = args.Length > 2 ? args[2] : "";
        if (command != "list-users") VpnValidation.Username(user);
        string? password = null;
        if (command is "add-user" or "reset-password") { Console.Write("VPN password: "); password = ReadSecret(); VpnValidation.Password(password); }
        var token = Environment.GetEnvironmentVariable("MINIVPN_CONTROL_TOKEN");
        if (!string.IsNullOrEmpty(token))
        {
            using var http = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false })
                { BaseAddress = new Uri($"http://127.0.0.1:{options.ControlPort}/control/"), Timeout = TimeSpan.FromSeconds(5) };
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            http.DefaultRequestHeaders.Add("X-Vpn-Actor-B64", Convert.ToBase64String(Encoding.UTF8.GetBytes("cli:" + Environment.UserName)));
            http.DefaultRequestHeaders.Add("X-Correlation-ID", Guid.NewGuid().ToString("N"));
            var available = false;
            try
            {
                using var identity = await http.GetAsync("store");
                if (!identity.IsSuccessStatusCode) throw new VpnException((int)identity.StatusCode, "control_rejected", "Control API từ chối truy cập; không ghi offline.");
                var result = await identity.Content.ReadFromJsonAsync<StoreIdentity>();
                if (result?.StoreId != StoreIdentity.For(path).StoreId) throw new VpnException(409, "different_store", "Server đang dùng kho tài khoản khác; không ghi dữ liệu.");
                available = true;
            }
            catch (HttpRequestException ex) when (ex.InnerException is System.Net.Sockets.SocketException socket && socket.SocketErrorCode == System.Net.Sockets.SocketError.ConnectionRefused) { }
            if (available)
            {
                var route = "accounts/" + Uri.EscapeDataString(user);
                HttpResponseMessage response;
                if (command == "list-users") response = await http.GetAsync("accounts");
                else if (command == "add-user")
                {
                    using var listing = await http.GetAsync("accounts"); listing.EnsureSuccessStatusCode();
                    var existing = await listing.Content.ReadFromJsonAsync<List<AccountInfo>>();
                    response = existing!.Any(a => a.Username == user)
                        ? await http.PostAsJsonAsync(route + "/password", new ResetPassword(password!))
                        : await http.PostAsJsonAsync("accounts", new CreateAccount(user, password!));
                }
                else response = command switch
                {
                    "delete-user" => await http.DeleteAsync(route),
                    "disable-user" => await http.PostAsync(route + "/disable", null),
                    "enable-user" => await http.PostAsync(route + "/enable", null),
                    "reset-password" => await http.PostAsJsonAsync(route + "/password", new ResetPassword(password!)),
                    "disconnect-user" => await http.PostAsync(route + "/disconnect", null),
                    _ => throw new ArgumentException("Unknown command")
                };
                using (response)
                {
                    if (!response.IsSuccessStatusCode) throw new VpnException((int)response.StatusCode, "control_rejected", "Thao tác thất bại; không ghi offline.");
                    if (command == "list-users") Console.WriteLine(await response.Content.ReadAsStringAsync());
                    else Console.WriteLine("Account operation completed through the running VPN server.");
                }
                return;
            }
        }
        if (command == "disconnect-user") throw new VpnException(409, "offline", "Ngắt phiên yêu cầu server đang chạy và control API có xác thực.");
        using var accounts = new FileAccountStore(path);
        var audit = new JsonLineAuditStore(options.AuditDirectory, options.RetentionDays);
        var sessions = new VpnSessionManager(audit);
        using var notifier = new ConfiguredAlertNotifier();
        using var alerts = new AlertService(notifier, new AlertHistory(options.AlertDirectory), audit, options);
        var service = new VpnManagementService(accounts, sessions, audit, alerts);
        var context = new OperationContext("offline-cli:" + Environment.UserName, Guid.NewGuid().ToString("N"));
        switch (command)
        {
            case "list-users": Console.WriteLine(JsonSerializer.Serialize(service.Accounts())); break;
            case "add-user":
                if (accounts.Find(user) is null) await service.CreateAsync(new(user, password!), context);
                else await service.ResetPasswordAsync(user, password!, context);
                break;
            case "disable-user": await service.SetEnabledAsync(user, false, context); break;
            case "enable-user": await service.SetEnabledAsync(user, true, context); break;
            case "reset-password": await service.ResetPasswordAsync(user, password!, context); break;
            case "delete-user": await service.DeleteAsync(user, context); break;
        }
        Console.WriteLine("Offline operation completed under exclusive account-store lock.");
    }
    private static string ReadSecret()
    {
        if (Console.IsInputRedirected) return Console.ReadLine() ?? "";
        var value = new StringBuilder(); ConsoleKeyInfo key;
        while ((key = Console.ReadKey(true)).Key != ConsoleKey.Enter)
        {
            if (key.Key == ConsoleKey.Backspace && value.Length > 0) value.Length--;
            else if (!char.IsControl(key.KeyChar) && value.Length < 256) value.Append(key.KeyChar);
        }
        Console.WriteLine(); return value.ToString();
    }
}
