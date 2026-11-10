using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Extensions.Hosting;

namespace MiniVpn.Management;

public sealed class VpnRuntimeState
{
    public DateTimeOffset StartedAt { get; } = DateTimeOffset.UtcNow;
    private DateTimeOffset _heartbeat = DateTimeOffset.UtcNow;
    private string _status = "starting";
    public DateTimeOffset Heartbeat { get { lock (this) return _heartbeat; } }
    public string Status { get { lock (this) return _status; } }
    public void Set(string value) { lock (this) { _status = value; _heartbeat = DateTimeOffset.UtcNow; } }
    public void Touch() { lock (this) _heartbeat = DateTimeOffset.UtcNow; }
    public object Health() { lock (this) return new { status = _status, startedAt = StartedAt, heartbeat = _heartbeat, processId = Environment.ProcessId }; }
    public void WriteStatus(ManagementOptions options)
    {
        lock (this)
        {
        Directory.CreateDirectory(options.StateDirectory);
        var temp = options.StatusFile + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(Health(), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        File.Move(temp, options.StatusFile, true);
        }
    }
}

public sealed class SystemMetricsProvider(IVpnSessionManager sessions, VpnRuntimeState state, ManagementOptions options) : ISystemMetricsProvider
{
    private TimeSpan? _previousCpu;
    private long _previousTime;
    public MetricsSnapshot Sample(string webStatus)
    {
        var now = DateTimeOffset.UtcNow;
        double? cpu = null; long? ram = null, total = null, available = null, diskTotal = null, diskFree = null;
        try
        {
            using var process = Process.GetCurrentProcess();
            var elapsed = Stopwatch.GetTimestamp(); var currentCpu = process.TotalProcessorTime;
            if (_previousCpu is { } previous)
                cpu = Math.Clamp((currentCpu - previous).TotalSeconds / Stopwatch.GetElapsedTime(_previousTime, elapsed).TotalSeconds / Environment.ProcessorCount * 100, 0, 100);
            _previousCpu = currentCpu; _previousTime = elapsed; ram = process.WorkingSet64;
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception) { }
        if (OperatingSystem.IsWindows())
        {
            var memory = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
            if (GlobalMemoryStatusEx(ref memory)) { total = (long)memory.TotalPhysical; available = (long)memory.AvailablePhysical; }
        }
        try
        {
            var disk = new DriveInfo(Path.GetPathRoot(options.StateDirectory)!);
            if (disk.IsReady) { diskTotal = disk.TotalSize; diskFree = disk.AvailableFreeSpace; }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException) { }
        return new(now, state.Status, state.StartedAt, (now - state.StartedAt).TotalSeconds, webStatus,
            sessions.List().Count(s => !s.Closing), cpu, ram, total, available, diskTotal, diskFree,
            sessions.ReceivedBytes, sessions.SentBytes,
            $"CPU: VPN process / {Environment.ProcessorCount} available logical CPUs; RAM: working set and system physical bytes; disk: state volume available bytes; traffic: valid IP payload bytes, excluding TLS/TCP overhead.");
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Length, Load;
        public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile, TotalVirtual, AvailableVirtual, AvailableExtendedVirtual;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
}

public sealed class VpnMonitor(ISystemMetricsProvider metrics, VpnRuntimeState state, AlertService alerts,
    IVpnAuditStore audit, AlertHistory history, ManagementOptions options) : BackgroundService
{
    private readonly Dictionary<string, DateTimeOffset> _exceeded = [];
    private readonly HttpClient _http = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(3) };
    public MetricsSnapshot? Latest { get; private set; }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(options.SampleSeconds));
        do
        {
            try
            {
                string webStatus;
                try
                {
                    using var response = await _http.GetAsync((options.WebHealthUseHttps ? "https" : "http") + "://127.0.0.1:18080/healthz", stoppingToken);
                    webStatus = response.IsSuccessStatusCode ? "online" : "offline";
                }
                catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException) { webStatus = "offline"; }
                if (webStatus == "offline") alerts.Publish("web-offline", "critical", "web-offline", "Website nội bộ không phản hồi health check.");
                var sample = metrics.Sample(webStatus); Latest = sample;
                Check("cpu-high", sample.ProcessCpuPercent > options.CpuPercent, alerts, options);
                Check("process-ram-high", sample.ProcessRamBytes / 1048576d > options.ProcessRamMiB, alerts, options);
                Check("system-ram-high", sample.SystemRamTotalBytes > 0 &&
                    (1 - sample.SystemRamAvailableBytes / (double?)sample.SystemRamTotalBytes) * 100 > options.SystemRamPercent, alerts, options);
                Check("disk-low", sample.DiskTotalBytes > 0 && sample.DiskFreeBytes / (double?)sample.DiskTotalBytes * 100 < options.DiskFreePercent, alerts, options);
                state.Touch(); state.WriteStatus(options);
                audit.Prune(); history.Prune();
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception)
            {
                alerts.Publish("monitor-error", "warning", "monitor-error", "Không thể lấy mẫu hoặc ghi dữ liệu giám sát.");
                Console.Error.WriteLine("VPN monitoring sample unavailable.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
    private void Check(string key, bool exceeded, AlertService service, ManagementOptions settings)
    {
        if (!exceeded) { _exceeded.Remove(key); return; }
        var now = DateTimeOffset.UtcNow;
        if (!_exceeded.TryGetValue(key, out var since)) _exceeded[key] = since = now;
        if (now - since >= TimeSpan.FromSeconds(settings.ThresholdDurationSeconds))
            service.Publish(key, "warning", key, "Ngưỡng tài nguyên bị vượt liên tục; xem mẫu metrics trên dashboard.");
    }
    public override void Dispose() { _http.Dispose(); base.Dispose(); }
}
