using System.Net;
using MiniVpn.InternalWeb.VpnAdmin;
using MiniVpn.Management;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
});
var configFile = Environment.GetEnvironmentVariable("MINIVPN_CONFIG");
if (!string.IsNullOrWhiteSpace(configFile)) builder.Configuration.AddJsonFile(Path.GetFullPath(configFile), optional: false);
builder.Configuration.AddEnvironmentVariables();
var adminOptions = VpnAdminOptions.Read(builder.Configuration, builder.Environment);
builder.Services.AddSingleton(PortalBackendOptions.Read(builder.Configuration));
builder.Services.AddVpnAdmin(adminOptions);
builder.WebHost.ConfigureKestrel(server =>
{
    server.Limits.MaxRequestBodySize = 16384;
    server.Listen(IPAddress.Loopback, 18080, listen =>
    {
        var certificatePath = builder.Configuration["VpnWeb:HttpsCertificatePath"];
        if (!string.IsNullOrWhiteSpace(certificatePath))
            listen.UseHttps(certificatePath, Environment.GetEnvironmentVariable("MINIVPN_WEB_PFX_PASSWORD"));
    });
});

var app = builder.Build();

app.UseVpnErrors();
app.MapVpnGateway();
app.UseDefaultFiles();
app.UseStaticFiles();

app.Run();
