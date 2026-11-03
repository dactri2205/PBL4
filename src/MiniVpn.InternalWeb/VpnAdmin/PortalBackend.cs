using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using MiniVpn.Management;

namespace MiniVpn.InternalWeb.VpnAdmin;

public sealed class PortalBackendOptions
{
    public string ApiBaseUrl { get; set; } = "http://127.0.0.1:13000/";
    public static PortalBackendOptions Read(IConfiguration configuration)
    {
        var value = new PortalBackendOptions(); configuration.GetSection("Portal").Bind(value);
        if (!Uri.TryCreate(value.ApiBaseUrl, UriKind.Absolute, out var uri) || uri.Scheme != "http" ||
            !IPAddress.TryParse(uri.Host, out var address) || !IPAddress.IsLoopback(address) ||
            uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0 || uri.UserInfo.Length > 0 ||
            uri.Port is 18080 or 18181)
            throw new InvalidOperationException("Portal:ApiBaseUrl must point to a dedicated HTTP loopback backend port, e.g. http://127.0.0.1:13000/.");
        return value;
    }
}
public sealed record PortalUser(string Id, string Name, string Username, string Role, DateTimeOffset? SessionExpiresAt);
public sealed record PortalUserResponse(PortalUser? Data);

// Only this server-side client communicates with Node. Session identity is revalidated
// against PostgreSQL on every VPN API request; browser role/identity headers are ignored.
public sealed class PortalBackendClient(PortalBackendOptions options) : IDisposable
{
    private readonly HttpClient _http = new(new HttpClientHandler { UseProxy = false, UseCookies = false, AllowAutoRedirect = false })
        { BaseAddress = new Uri(options.ApiBaseUrl), Timeout = TimeSpan.FromSeconds(10) };
    private static HttpRequestMessage Request(HttpContext context, HttpMethod method, string route)
    {
        var request = new HttpRequestMessage(method, route);
        request.Headers.Host = context.Request.Host.Value;
        request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", context.Request.Scheme);
        if (context.Request.Headers.Cookie.Count > 0) request.Headers.TryAddWithoutValidation("Cookie", context.Request.Headers.Cookie.ToArray());
        if (context.Request.Headers.Origin.Count > 0) request.Headers.TryAddWithoutValidation("Origin", context.Request.Headers.Origin.ToArray());
        request.Headers.TryAddWithoutValidation("Accept", "application/json");
        return request;
    }
    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        try { return await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct); }
        catch (HttpRequestException) { throw new VpnException(503, "portal_offline", "Không kết nối được backend website."); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new VpnException(504, "portal_timeout", "Backend website không phản hồi trong thời hạn."); }
    }
    public async Task<PortalUser?> CurrentUserAsync(HttpContext context)
    {
        if (!context.Request.Cookies.ContainsKey("__Host-avsid") && !context.Request.Cookies.ContainsKey("avsid")) return null;
        using var request = Request(context, HttpMethod.Get, "api/me");
        using var response = await SendAsync(request, context.RequestAborted);
        if (response.StatusCode == HttpStatusCode.Unauthorized) return null;
        if (!response.IsSuccessStatusCode) throw new VpnException(503, "portal_unavailable", "Chưa xác minh được phiên đăng nhập website.");
        PortalUser? user;
        try { user = (await response.Content.ReadFromJsonAsync<PortalUserResponse>(context.RequestAborted))?.Data; }
        catch (System.Text.Json.JsonException) { throw new VpnException(502, "invalid_portal_identity", "Backend trả thông tin phiên không hợp lệ."); }
        if (user is null || string.IsNullOrWhiteSpace(user.Id) || user.Id.Length > 100 || string.IsNullOrWhiteSpace(user.Username) || user.Role is not ("ADMIN" or "EMPLOYEE"))
            throw new VpnException(502, "invalid_portal_identity", "Backend trả thông tin phiên không hợp lệ.");
        return user;
    }
    public async Task<bool> HealthyAsync(CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "api/health");
        try { using var response = await SendAsync(request, ct); return response.IsSuccessStatusCode; }
        catch (VpnException) { return false; }
    }
    public async Task LogoutAsync(HttpContext context)
    {
        using var request = Request(context, HttpMethod.Post, "api/auth/logout");
        // The caller has passed gateway CSRF. Supply the public origin to Node's own check.
        request.Headers.Remove("Origin");
        request.Headers.TryAddWithoutValidation("Origin", $"{context.Request.Scheme}://{context.Request.Host}");
        using var response = await SendAsync(request, context.RequestAborted);
        if (!response.IsSuccessStatusCode) throw new VpnException(503, "portal_logout_failed", "Chưa thể kết thúc phiên đăng nhập website.");
        CopyCookies(response, context);
    }
    private static void CopyCookies(HttpResponseMessage response, HttpContext context)
    {
        if (response.Headers.TryGetValues("Set-Cookie", out var cookies))
            foreach (var cookie in cookies) context.Response.Headers.Append("Set-Cookie", cookie);
    }
    public async Task ForwardAsync(HttpContext context)
    {
        // Route derived from the matched /api endpoint, never an arbitrary client URL.
        using var request = Request(context, new HttpMethod(context.Request.Method), context.Request.Path.Value!.TrimStart('/') + context.Request.QueryString);
        if (context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpRequestBodyDetectionFeature>()?.CanHaveBody == true)
        {
            request.Content = new StreamContent(context.Request.Body);
            if (context.Request.ContentType is { } contentType) request.Content.Headers.TryAddWithoutValidation("Content-Type", contentType);
        }
        using var response = await SendAsync(request, context.RequestAborted);
        context.Response.StatusCode = (int)response.StatusCode;
        if (response.Content.Headers.ContentType is { } type) context.Response.ContentType = type.ToString();
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        CopyCookies(response, context);
        if (response.Headers.TryGetValues("Retry-After", out var retry)) context.Response.Headers["Retry-After"] = retry.ToArray();
        if (response.StatusCode != HttpStatusCode.NoContent) await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
    }
    public void Dispose() => _http.Dispose();
}

public sealed class PortalAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
    UrlEncoder encoder, PortalBackendClient backend)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "PortalSession";
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Path.StartsWithSegments("/api/vpn")) return AuthenticateResult.NoResult();
        var user = await backend.CurrentUserAsync(Context);
        if (user is null) return AuthenticateResult.NoResult();
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id), new(ClaimTypes.Name, user.Username), new("portal_role", user.Role) };
        if (user.Role == "ADMIN") claims.Add(new(ClaimTypes.Role, "VPN_ADMIN"));
        if (user.SessionExpiresAt is { } expires) claims.Add(new("vpn_expires", expires.ToString("O")));
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName));
    }
}
