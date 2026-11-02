using System.Net;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
});
builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, 18080));

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.Run();
