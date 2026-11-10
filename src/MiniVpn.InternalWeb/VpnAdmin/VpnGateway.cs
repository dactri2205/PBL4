using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using MiniVpn.Management;

namespace MiniVpn.InternalWeb.VpnAdmin;

public sealed record AdminLoginRequest(string Username, string Password);
public static partial class VpnGateway
{
    public static void MapVpnGateway(this WebApplication app)
    {
        app.UseAuthentication(); app.UseAuthorization();
        app.MapGet("/healthz", async (PortalBackendClient backend, VpnAdminOptions options, HttpContext context) =>
            options.AuthenticationMode == "Temporary" || await backend.HealthyAsync(context.RequestAborted)
                ? Results.Ok(new { status = "online" }) : Results.Json(new { status = "offline", service = "portal-backend" }, statusCode: 503));
        app.MapMethods("/api/{**path}", ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
            (HttpContext context, PortalBackendClient backend, VpnAdminOptions options) =>
            {
                if (context.Request.Path.StartsWithSegments("/api/auth")) RequireTransport(context, options);
                return backend.ForwardAsync(context);
            });
        app.MapGet("/api/vpn/auth/session", (HttpContext context, IAntiforgery csrf, IVpnAdminAuthorizer authorizer, VpnAdminOptions options) =>
        {
            RequireTransport(context, options);
            var tokens = csrf.GetAndStoreTokens(context);
            return Results.Ok(new { authenticated = context.User.Identity?.IsAuthenticated == true,
                isAdmin = authorizer.IsAdmin(context.User), username = context.User.Identity?.Name,
                temporaryLoginEnabled = options.TemporaryLoginEnabled, authenticationMode = options.AuthenticationMode,
                loginUrl = "login.html?returnTo=vpn-admin.html", csrfToken = tokens.RequestToken,
                expiresAt = context.User.FindFirstValue("vpn_expires") });
        });
        app.MapPost("/api/vpn/auth/login", async (AdminLoginRequest request, HttpContext context, VpnAdminOptions options,
            TemporaryAdminCredentials credentials, TemporaryAdminSessions sessions, AttemptLimiter limiter, IAntiforgery csrf) =>
        {
            RequireTransport(context, options);
            await ValidateCsrf(context, csrf);
            if (options.AuthenticationMode != "Temporary" || !options.TemporaryLoginEnabled) throw new VpnException(403, "temporary_login_disabled", "Hãy đăng nhập bằng tài khoản website.");
            var key = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            // Count every attempt, including successes, to cap PBKDF work and session creation.
            if (limiter.IsBlocked(key)) throw new VpnException(429, "login_rate_limited", "Thử đăng nhập quá nhiều lần. Vui lòng chờ 5 phút.");
            limiter.Fail(key);
            if (!credentials.Verify(request.Username, request.Password)) throw new VpnException(401, "invalid_credentials", "Tên đăng nhập hoặc mật khẩu không đúng.");
            var duration = TimeSpan.FromMinutes(options.SessionMinutes);
            var id = sessions.Create(duration); var expires = DateTimeOffset.UtcNow + duration;
            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, options.Username), new Claim(ClaimTypes.Name, options.Username),
                new Claim(ClaimTypes.Role, "VPN_ADMIN"), new Claim("vpn_session", id), new Claim("vpn_expires", expires.ToString("O")) };
            await context.SignInAsync(AdminAuthentication.Scheme, new ClaimsPrincipal(new ClaimsIdentity(claims, AdminAuthentication.Scheme)),
                new AuthenticationProperties { IsPersistent = false, ExpiresUtc = expires, AllowRefresh = false });
            return Results.Ok(new { authenticated = true });
        });
        app.MapPost("/api/vpn/auth/logout", async (HttpContext context, TemporaryAdminSessions sessions, IAntiforgery csrf, VpnAdminOptions options, PortalBackendClient backend) =>
        {
            RequireTransport(context, options);
            if (context.User.Identity?.IsAuthenticated != true) throw new VpnException(401, "unauthorized", "Vui lòng đăng nhập quản trị.");
            await ValidateCsrf(context, csrf);
            if (options.AuthenticationMode == "Portal") { await backend.LogoutAsync(context); return Results.NoContent(); }
            sessions.Revoke(context.User.FindFirstValue("vpn_session"));
            await context.SignOutAsync(AdminAuthentication.Scheme); return Results.NoContent();
        });
        app.MapMethods("/api/vpn/{**route}", ["GET", "POST", "DELETE", "PUT", "PATCH"], async (string? route, HttpContext context,
            IVpnAdminAuthorizer authorizer, IAntiforgery csrf, VpnControlClient client, VpnAdminOptions options) =>
        {
            RequireTransport(context, options);
            if (context.User.Identity?.IsAuthenticated != true) throw new VpnException(401, "unauthorized", "Vui lòng đăng nhập quản trị VPN.");
            if (!authorizer.IsAdmin(context.User)) throw new VpnException(403, "forbidden", "Bạn không có quyền quản trị VPN.");
            if (!HttpMethods.IsGet(context.Request.Method)) await ValidateCsrf(context, csrf);
            route ??= "";
            var allowed = context.Request.Method switch
            {
                "GET" => route is "accounts" or "sessions" or "logs" or "overview" or "health" or "metrics" or "alerts",
                "POST" => route == "accounts" || AccountAction().IsMatch(route) || SessionAction().IsMatch(route),
                "DELETE" => AccountPath().IsMatch(route),
                _ => false
            };
            if (!allowed) throw new VpnException(404, "endpoint_not_found", "Không tìm thấy API.");
            await client.ForwardAsync(context, route);
        });
    }
    private static void RequireTransport(HttpContext context, VpnAdminOptions options)
    {
        if (!context.Request.IsHttps && !options.InsecureDevelopment)
            throw new VpnException(403, "https_required", "Quản trị yêu cầu HTTPS. Demo HTTP qua tunnel cần cấu hình Development rõ ràng.");
    }
    private static async Task ValidateCsrf(HttpContext context, IAntiforgery csrf)
    {
        try { await csrf.ValidateRequestAsync(context); }
        catch (AntiforgeryValidationException) { throw new VpnException(400, "csrf_invalid", "Phiên bảo vệ CSRF không hợp lệ. Tải lại trang."); }
    }
    [GeneratedRegex(@"^accounts/[A-Za-z0-9_]{1,32}/(disable|enable|password|disconnect)$")]
    private static partial Regex AccountAction();
    [GeneratedRegex(@"^accounts/[A-Za-z0-9_]{1,32}$")]
    private static partial Regex AccountPath();
    [GeneratedRegex(@"^sessions/[a-f0-9]{32}/disconnect$")]
    private static partial Regex SessionAction();
}
