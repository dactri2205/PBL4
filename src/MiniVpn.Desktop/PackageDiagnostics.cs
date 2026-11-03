using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MiniVpn.Wintun;

namespace MiniVpn.Desktop;

internal static class PackageDiagnostics
{
    internal static string? WintunLicense()
    {
        using var stream = typeof(PackageDiagnostics).Assembly.GetManifestResourceStream("MiniVpn.Wintun.License.txt");
        if (stream is null) return null;
        using var reader = new StreamReader(stream); return reader.ReadToEnd();
    }
    internal static int Run()
    {
        IntPtr library = IntPtr.Zero;
        try
        {
            library = NativeLibrary.Load("wintun.dll", typeof(Tun).Assembly, null);
            foreach (var entry in new[] { "WintunCreateAdapter", "WintunStartSession", "WintunReceivePacket", "WintunSendPacket" })
                _ = NativeLibrary.GetExport(library, entry);
            var nativePath = new StringBuilder(32768);
            if (GetModuleFileName(library, nativePath, nativePath.Capacity) == 0) throw new IOException("Native library location unavailable.");
            var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(nativePath.ToString())));
            var license = WintunLicense();
            if (string.IsNullOrWhiteSpace(license)) throw new InvalidDataException("Bundled Wintun license missing.");
            ApplicationConfiguration.Initialize();
            using var form = new MainForm();
            form.CreateControl();
            if (form.Controls.Find("openWebsiteButton", true).Single() is not Button { Enabled: false })
                throw new InvalidOperationException("Website action must be disabled before VPN connects.");
            Console.WriteLine(JsonSerializer.Serialize(new { success = true, architecture = RuntimeInformation.ProcessArchitecture.ToString(),
                runtime = Environment.Version.ToString(), wintunSha256 = hash, licenseIncluded = true, formInitialized = true,
                adaptersCreated = false, routesModified = false }));
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { success = false, error = ex.GetType().Name, message = ex.Message }));
            return 1;
        }
        finally { if (library != IntPtr.Zero) NativeLibrary.Free(library); }
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "GetModuleFileNameW")]
    private static extern uint GetModuleFileName(IntPtr module, StringBuilder path, int length);
}
