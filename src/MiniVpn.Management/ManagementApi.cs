using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace MiniVpn.Management;

public static class ManagementApi
{
    public static IServiceCollection AddVpnManagement(this IServiceCollection services, ManagementOptions options, string accountPath)
    {
        services.AddSingleton(options);
        services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(o => o.ThrowOnBadRequest = true);
        services.AddSingleton(StoreIdentity.For(accountPath));
        services.AddSingleton<IVpnAccountStore>(_ => new FileAccountStore(accountPath));
        services.AddSingleton<IVpnAuditStore>(_ => new JsonLineAuditStore(options.AuditDirectory, options.RetentionDays));
        services.AddSingleton<IVpnSessionManager, VpnSessionManager>();
        services.AddSingleton<IAlertNotifier, ConfiguredAlertNotifier>();
        services.AddSingleton(new AlertHistory(options.AlertDirectory, options.RetentionDays));
        services.AddSingleton<AlertService>();
        services.AddHostedService(s => s.GetRequiredService<AlertService>());
        services.AddSingleton<VpnManagementService>();
        services.AddSingleton<VpnRuntimeState>();
        services.AddSingleton<ISystemMetricsProvider, SystemMetricsProvider>();
        services.AddSingleton<VpnMonitor>();
        services.AddHostedService(s => s.GetRequiredService<VpnMonitor>());
        return services;
    }

    public static void UseVpnErrors(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            context.TraceIdentifier = Guid.NewGuid().ToString("N");
            context.Response.Headers["X-Correlation-ID"] = context.TraceIdentifier;
            if (context.Request.Path.StartsWithSegments("/api/vpn") || context.Request.Path.StartsWithSegments("/control"))
                context.Response.Headers.CacheControl = "no-store";
            try { await next(context); }
            catch (VpnException ex) { await Error(context, ex.Status, ex.Code, ex.Message); }
            catch (BadHttpRequestException ex)
            { await Error(context, ex.StatusCode, "invalid_request", "Yêu cầu không hợp lệ."); }
            catch (Exception ex) when (ex is JsonException or FormatException or ArgumentException)
            { await Error(context, 400, "invalid_request", "Yêu cầu không hợp lệ."); }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
            catch (Exception)
            {
                Console.Error.WriteLine("Service request failed. Correlation: " + context.TraceIdentifier);
                await Error(context, 500, "internal_error", "Dịch vụ chưa thể xử lý yêu cầu.");
            }
        });
    }
    public static Task Error(HttpContext context, int status, string code, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { error = new { code, message, correlationId = context.TraceIdentifier } });
    }
    public static bool MatchesSecret(string? actual, string? expected) => !string.IsNullOrEmpty(actual) && !string.IsNullOrEmpty(expected) &&
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(actual)), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));

    public static void MapVpnControl(this WebApplication app, string? serviceToken)
    {
        app.Use(async (context, next) =>
        {
            if (!context.Request.Path.StartsWithSegments("/control")) { await next(context); return; }
            if (context.Connection.RemoteIpAddress is not { } ip || !IPAddress.IsLoopback(ip))
            { await Error(context, 403, "loopback_only", "Control API chỉ cho phép loopback."); return; }
            if (serviceToken is null || serviceToken.Length < 32)
            { await Error(context, 503, "control_not_configured", "Control API chưa được cấu hình."); return; }
            var header = context.Request.Headers.Authorization.ToString();
            if (!header.StartsWith("Bearer ", StringComparison.Ordinal) || !MatchesSecret(header[7..], serviceToken))
            { await Error(context, 401, "invalid_service_credentials", "Không được phép truy cập control API."); return; }
            if (Guid.TryParseExact(context.Request.Headers["X-Correlation-ID"], "N", out var correlation))
            {
                context.TraceIdentifier = correlation.ToString("N");
                context.Response.Headers["X-Correlation-ID"] = context.TraceIdentifier;
            }
            await next(context);
        });
        var group = app.MapGroup("/control");
        group.MapGet("/store", (StoreIdentity identity) => Results.Ok(identity));
        group.MapGet("/health", (VpnRuntimeState state, ManagementOptions options) =>
            state.Status == "running" && DateTimeOffset.UtcNow - state.Heartbeat < TimeSpan.FromSeconds(options.SampleSeconds * 3 + 5)
                ? Results.Ok(state.Health()) : Results.Json(state.Health(), statusCode: 503));
        group.MapGet("/overview", (VpnMonitor monitor, VpnRuntimeState state, IVpnSessionManager sessions, IVpnAuditStore audit, ManagementOptions settings) =>
            Results.Ok(new { health = state.Health(), metrics = monitor.Latest, activeSessions = sessions.List().Count(s => !s.Closing),
                auditHealthy = audit.IsHealthy, sampleIntervalSeconds = settings.SampleSeconds }));
        group.MapGet("/metrics", (VpnMonitor monitor) => Results.Ok(monitor.Latest));
        group.MapGet("/accounts", (VpnManagementService service) => Results.Ok(service.Accounts()));
        group.MapPost("/accounts", async (CreateAccount request, VpnManagementService service, HttpContext context) =>
            Results.Json(await service.CreateAsync(request, Actor(context), context.RequestAborted), statusCode: 201));
        group.MapPost("/accounts/{username}/disable", async (string username, VpnManagementService service, HttpContext context) =>
            Results.Ok(await service.SetEnabledAsync(username, false, Actor(context), context.RequestAborted)));
        group.MapPost("/accounts/{username}/enable", async (string username, VpnManagementService service, HttpContext context) =>
            Results.Ok(await service.SetEnabledAsync(username, true, Actor(context), context.RequestAborted)));
        group.MapPost("/accounts/{username}/password", async (string username, ResetPassword request, VpnManagementService service, HttpContext context) =>
        {
            await service.ResetPasswordAsync(username, request.Password, Actor(context), context.RequestAborted); return Results.NoContent();
        });
        group.MapDelete("/accounts/{username}", async (string username, VpnManagementService service, HttpContext context) =>
        {
            await service.DeleteAsync(username, Actor(context), context.RequestAborted); return Results.NoContent();
        });
        group.MapGet("/sessions", (IVpnSessionManager sessions) => Results.Ok(sessions.List()));
        group.MapPost("/sessions/{sessionId}/disconnect", (string sessionId, VpnManagementService service, HttpContext context) =>
            Results.Ok(new { revoked = service.Disconnect(sessionId, Actor(context)) }));
        group.MapPost("/accounts/{username}/disconnect", async (string username, VpnManagementService service, HttpContext context) =>
            Results.Ok(new { revoked = await service.DisconnectUserAsync(username, Actor(context), context.RequestAborted) }));
        group.MapGet("/logs", ([AsParameters] AuditQuery query, IVpnAuditStore audit) => Results.Ok(audit.Query(query)));
        group.MapGet("/alerts", (IAlertNotifier notifier, AlertHistory history, ManagementOptions options) =>
            Results.Ok(new { configuration = new { enabled = notifier.Enabled, provider = notifier.Provider,
                cooldownSeconds = options.AlertCooldownSeconds, retentionDays = options.RetentionDays }, items = history.Recent() }));
    }
    private static OperationContext Actor(HttpContext context)
    {
        var encoded = context.Request.Headers["X-Vpn-Actor-B64"].FirstOrDefault();
        var actor = encoded is null ? context.Request.Headers["X-Vpn-Actor"].FirstOrDefault() ?? "control-client"
            : Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
        return new(VpnValidation.Clean(actor, 80), context.TraceIdentifier);
    }
}
