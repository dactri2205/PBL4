using Microsoft.Extensions.Configuration;

namespace MiniVpn.Management;

public sealed class ManagementOptions
{
    public int ControlPort { get; set; } = 18181;
    public string StateDirectory { get; set; } = "runtime/vpn";
    public int RetentionDays { get; set; } = 30;
    public int SampleSeconds { get; set; } = 10;
    public int AlertCooldownSeconds { get; set; } = 300;
    public int ThresholdDurationSeconds { get; set; } = 60;
    public double CpuPercent { get; set; } = 90;
    public double ProcessRamMiB { get; set; } = 1024;
    public double SystemRamPercent { get; set; } = 90;
    public double DiskFreePercent { get; set; } = 10;
    public int WatchdogFailures { get; set; } = 3;
    public bool WebHealthUseHttps { get; set; }
    public string AuditDirectory => Path.Combine(Path.GetFullPath(StateDirectory), "audit");
    public string AlertDirectory => Path.Combine(Path.GetFullPath(StateDirectory), "alerts");
    public string StatusFile => Path.Combine(Path.GetFullPath(StateDirectory), "status.json");
    public static ManagementOptions Read(IConfiguration configuration)
    {
        var value = new ManagementOptions(); configuration.GetSection("VpnManagement").Bind(value);
        // dotnet run uses different working directories for Server/Web/Watchdog. Resolve
        // shared state relative to the external config, or the checkout root, consistently.
        var configFile = Environment.GetEnvironmentVariable("MINIVPN_CONFIG");
        var checkout = new DirectoryInfo(AppContext.BaseDirectory);
        while (checkout is not null && !File.Exists(Path.Combine(checkout.FullName, "MiniVpn.sln"))) checkout = checkout.Parent;
        var root = !string.IsNullOrWhiteSpace(configFile) ? Path.GetDirectoryName(Path.GetFullPath(configFile))!
            : checkout?.FullName ?? AppContext.BaseDirectory;
        value.StateDirectory = Path.GetFullPath(value.StateDirectory, root);
        if (value.ControlPort is < 1024 or > 65535 || value.SampleSeconds is < 2 or > 300 ||
            value.RetentionDays is < 1 or > 3650 || value.AlertCooldownSeconds is < 5 or > 86400 ||
            value.ThresholdDurationSeconds is < 0 or > 3600 || value.CpuPercent is < 1 or > 100 ||
            value.ProcessRamMiB < 1 || value.SystemRamPercent is < 1 or > 100 || value.DiskFreePercent is < 1 or > 100 ||
            value.WatchdogFailures is < 1 or > 60)
            throw new InvalidOperationException("Invalid VpnManagement configuration.");
        return value;
    }
}
