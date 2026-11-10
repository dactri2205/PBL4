using System.Windows.Forms;
using System.ComponentModel;
using System.Diagnostics;
using System.Security.Principal;

namespace MiniVpn.Desktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Packaging diagnostics deliberately don't create adapters, alter routes or elevate.
        if (args is ["--self-test"]) return PackageDiagnostics.Run();
        if (!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
        {
            try
            {
                var start = new ProcessStartInfo(Environment.ProcessPath!)
                {
                    UseShellExecute = true, Verb = "runas", WorkingDirectory = AppContext.BaseDirectory
                };
                // Development launcher may execute `dotnet MiniVpn.Desktop.dll`.
                if (Path.GetFileNameWithoutExtension(start.FileName).Equals("dotnet", StringComparison.OrdinalIgnoreCase))
                    start.ArgumentList.Add(Environment.GetCommandLineArgs()[0]);
                using var elevated = Process.Start(start);
                return elevated is null ? 1 : 0;
            }
            catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
            {
                MessageBox.Show("MiniVPN cần quyền Administrator để tạo adapter Wintun và route. Hãy chạy lại ứng dụng và chấp nhận yêu cầu quyền.", "MiniVPN", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 1;
            }
            catch (Exception)
            {
                MessageBox.Show("Không thể mở MiniVPN với quyền Administrator. Hãy nhấn chuột phải file EXE và chọn Run as administrator.", "MiniVPN", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
        ApplicationConfiguration.Initialize();
        using var form = new MainForm();
        Application.Run(form);
        return 0;
    }
}
