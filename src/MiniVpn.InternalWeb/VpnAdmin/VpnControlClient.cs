using System.Net.Http.Headers;
using MiniVpn.Management;

namespace MiniVpn.InternalWeb.VpnAdmin;

public sealed class VpnControlClient(VpnAdminOptions options) : IDisposable
{
    private readonly HttpClient _http = new(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false })
    { Timeout = TimeSpan.FromSeconds(8), BaseAddress = new Uri($"http://127.0.0.1:{options.ControlPort}/control/") };
    public async Task ForwardAsync(HttpContext context, string route)
    {
        if (options.ServiceToken is null || options.ServiceToken.Length < 32)
            throw new VpnException(503, "control_not_configured", "Kết nối quản trị VPN chưa được cấu hình.");
        using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), route + context.Request.QueryString);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ServiceToken);
        var actor = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? context.User.Identity?.Name ?? "website-admin";
        request.Headers.Add("X-Vpn-Actor-B64", Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(VpnValidation.Clean(actor, 80))));
        request.Headers.Add("X-Correlation-ID", context.TraceIdentifier);
        var hasBody = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpRequestBodyDetectionFeature>()?.CanHaveBody
            ?? context.Request.ContentLength is > 0;
        if (HttpMethods.IsPost(context.Request.Method) && hasBody)
        {
            if (!context.Request.HasJsonContentType()) throw new VpnException(415, "json_required", "Chỉ chấp nhận JSON.");
            using var reader = new StreamReader(context.Request.Body);
            var body = await reader.ReadToEndAsync(context.RequestAborted);
            if (body.Length > 16384) throw new VpnException(413, "body_too_large", "Yêu cầu quá lớn.");
            request.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
        }
        try
        {
            using var response = await _http.SendAsync(request, context.RequestAborted);
            if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
                throw new VpnException(502, "control_authentication_failed", "Gateway chưa xác thực được với VPN server.");
            context.Response.StatusCode = (int)response.StatusCode;
            if (response.Content.Headers.ContentType is { } type) context.Response.ContentType = type.ToString();
            if (response.StatusCode != System.Net.HttpStatusCode.NoContent)
                await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
        }
        catch (HttpRequestException) { throw new VpnException(503, "vpn_offline", "Mất kết nối tới VPN server."); }
        catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
        { throw new VpnException(504, "vpn_timeout", "VPN server không phản hồi trong thời hạn."); }
    }
    public void Dispose() => _http.Dispose();
}
