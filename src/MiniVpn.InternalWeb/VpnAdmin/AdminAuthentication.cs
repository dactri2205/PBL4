using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MiniVpn.Common;
using MiniVpn.Management;

namespace MiniVpn.InternalWeb.VpnAdmin;

// Replace this evaluator and the authentication scheme with the future backend's trusted
// principal. It never reads roles from requests, browser storage or the website preview.
public interface IVpnAdminAuthorizer { bool IsAdmin(ClaimsPrincipal principal); }
public sealed class VpnAdminAuthorizer : IVpnAdminAuthorizer
{
    public bool IsAdmin(ClaimsPrincipal principal) => principal.Identity?.IsAuthenticated == true && principal.IsInRole("VPN_ADMIN");
}
public sealed class TemporaryAdminSessions
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _sessions = [];
    public string Create(TimeSpan duration)
    {
        foreach (var item in _sessions.Where(x => x.Value <= DateTimeOffset.UtcNow)) _sessions.TryRemove(item.Key, out _);
        if (_sessions.Count >= 1000) throw new VpnException(429, "too_many_sessions", "Quá nhiều phiên quản trị.");
        var id = Guid.NewGuid().ToString("N"); _sessions[id] = DateTimeOffset.UtcNow + duration; return id;
    }
    public bool Valid(string? id) => id is not null && _sessions.TryGetValue(id, out var until) && until > DateTimeOffset.UtcNow;
    public void Revoke(string? id) { if (id is not null) _sessions.TryRemove(id, out _); }
}
public sealed class VpnAdminOptions
{
    public string AuthenticationMode { get; set; } = "Portal";
    public bool TemporaryLoginEnabled { get; set; }
    public bool AllowInsecureHttpDevelopment { get; set; }
    public int SessionMinutes { get; set; } = 30;
    public int ControlPort { get; set; } = 18181;
    public string Username { get; init; } = Environment.GetEnvironmentVariable("MINIVPN_ADMIN_USERNAME") ?? "vpn-admin";
    public string? Password { get; init; } = Environment.GetEnvironmentVariable("MINIVPN_ADMIN_PASSWORD");
    public string? ServiceToken { get; init; } = Environment.GetEnvironmentVariable("MINIVPN_CONTROL_TOKEN");
    public bool InsecureDevelopment { get; private set; }
    public static VpnAdminOptions Read(IConfiguration configuration, IHostEnvironment environment)
    {
        var options = new VpnAdminOptions(); configuration.GetSection("VpnAdmin").Bind(options);
        if (options.AuthenticationMode is not ("Portal" or "Temporary")) throw new InvalidOperationException("VpnAdmin:AuthenticationMode must be Portal or Temporary.");
        if (options.AuthenticationMode == "Portal" && options.TemporaryLoginEnabled) throw new InvalidOperationException("Temporary login must be disabled in Portal authentication mode.");
        if (options.SessionMinutes is < 5 or > 120 || options.ControlPort is < 1024 or > 65535) throw new InvalidOperationException("Invalid VpnAdmin configuration.");
        if (options.AllowInsecureHttpDevelopment && !environment.IsDevelopment()) throw new InvalidOperationException("Insecure admin cookies require ASPNETCORE_ENVIRONMENT=Development.");
        options.InsecureDevelopment = options.AllowInsecureHttpDevelopment && environment.IsDevelopment();
        if (options.TemporaryLoginEnabled)
        {
            if (string.IsNullOrWhiteSpace(options.Username)) throw new InvalidOperationException("Temporary admin username is required.");
            VpnValidation.Text(options.Username, 80); VpnValidation.Password(options.Password);
            if (options.ServiceToken is null || options.ServiceToken.Length < 32) throw new InvalidOperationException("Temporary admin requires MINIVPN_CONTROL_TOKEN (at least 32 characters).");
        }
        return options;
    }
}
public sealed class TemporaryAdminCredentials(VpnAdminOptions options)
{
    // Hash once; do not keep PBKDF work in a request path for successful login comparisons.
    private readonly PasswordRecord? _record = options.TemporaryLoginEnabled ? Passwords.Create(options.Password!) : null;
    public bool Verify(string? username, string? password) => _record is not null && username == options.Username &&
        password is { Length: <= 256 } && Passwords.Verify(password, _record);
}
public static class AdminAuthentication
{
    public const string Scheme = "VpnAdmin";
    public static void AddVpnAdmin(this IServiceCollection services, VpnAdminOptions options)
    {
        services.AddSingleton(options);
        services.TryAddSingleton<PortalBackendOptions>();
        services.AddSingleton<PortalBackendClient>();
        services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
        services.AddSingleton<TemporaryAdminSessions>();
        services.AddSingleton<TemporaryAdminCredentials>();
        services.AddSingleton<IVpnAdminAuthorizer, VpnAdminAuthorizer>();
        services.AddSingleton(new AttemptLimiter(5, TimeSpan.FromMinutes(5)));
        services.AddSingleton<VpnControlClient>();
        // Temporary sessions intentionally expire on web restart. The business backend can
        // supply its own durable authentication/data protection configuration later.
        services.AddDataProtection().UseEphemeralDataProtectionProvider();
        services.AddAuthentication(options.AuthenticationMode == "Portal" ? PortalAuthenticationHandler.SchemeName : Scheme)
            .AddScheme<AuthenticationSchemeOptions, PortalAuthenticationHandler>(PortalAuthenticationHandler.SchemeName, _ => { })
            .AddCookie(Scheme, cookie =>
        {
            cookie.Cookie.Name = "MiniVpn.Admin"; cookie.Cookie.HttpOnly = true; cookie.Cookie.SameSite = SameSiteMode.Strict;
            cookie.Cookie.SecurePolicy = options.InsecureDevelopment ? CookieSecurePolicy.None : CookieSecurePolicy.Always;
            cookie.Cookie.Path = "/api/vpn"; cookie.ExpireTimeSpan = TimeSpan.FromMinutes(options.SessionMinutes);
            cookie.SlidingExpiration = false;
            cookie.Events = new CookieAuthenticationEvents
            {
                OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; },
                OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; },
                OnValidatePrincipal = c =>
                {
                    if (!c.HttpContext.RequestServices.GetRequiredService<TemporaryAdminSessions>().Valid(c.Principal?.FindFirstValue("vpn_session"))) c.RejectPrincipal();
                    return Task.CompletedTask;
                }
            };
        });
        services.AddAuthorization();
        services.AddAntiforgery(a =>
        {
            a.HeaderName = "X-CSRF-Token"; a.Cookie.Name = "MiniVpn.Csrf"; a.Cookie.Path = "/api/vpn";
            a.Cookie.HttpOnly = true; a.Cookie.SameSite = SameSiteMode.Strict;
            a.Cookie.SecurePolicy = options.InsecureDevelopment ? CookieSecurePolicy.None : CookieSecurePolicy.Always;
        });
    }
}
