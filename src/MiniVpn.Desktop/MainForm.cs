using System.Net;
using System.Net.Sockets;
using System.Security.Authentication;
using System.ComponentModel;
using MiniVpn.ClientCore;

namespace MiniVpn.Desktop;

public sealed class MainForm : Form
{
    private readonly TextBox serverBox = new();
    private readonly TextBox portBox = new();
    private readonly TextBox userBox = new();
    private readonly TextBox passwordBox = new();
    private readonly TextBox pinBox = new();
    private readonly Button connectButton = new();
    private readonly Button disconnectButton = new();
    private readonly Button testButton = new();
    private readonly Label statusLabel = new();
    private readonly Label addressLabel = new();
    private readonly ListBox logBox = new();
    private CancellationTokenSource? connectionStop;
    private bool connecting;
    private bool closeRequested;

    private static readonly Color Ink = Color.FromArgb(21, 36, 58);
    private static readonly Color Accent = Color.FromArgb(37, 102, 230);
    private static readonly Color Muted = Color.FromArgb(102, 116, 137);

    public MainForm()
    {
        Text = "Mini VPN | Kết nối nội bộ";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        ClientSize = new Size(620, 750);
        MinimumSize = Size;
        BackColor = Color.FromArgb(245, 248, 253);
        ForeColor = Ink;
        Font = new Font("Segoe UI", 10);

        var heading = NewLabel("Mini VPN", 24, 18, 560, 42, 22, true, Ink);
        var subtitle = NewLabel("Kết nối an toàn tới mạng nội bộ qua Wintun và TLS", 24, 61, 560, 28, 10, false, Muted);
        Controls.Add(heading); Controls.Add(subtitle);

        var card = new Panel { Left = 20, Top = 104, Width = 580, Height = 402, BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
        Controls.Add(card);
        card.Controls.Add(NewLabel("Thông tin kết nối", 20, 16, 520, 28, 12, true, Ink));
        AddField(card, "IP LAN máy chủ", serverBox, 20, 58, 352, "Ví dụ: 192.168.1.10");
        AddField(card, "Cổng VPN", portBox, 392, 58, 166, "42424");
        portBox.Text = "42424";
        AddField(card, "Tài khoản VPN", userBox, 20, 124, 538, "alice");
        AddField(card, "Mật khẩu VPN", passwordBox, 20, 190, 538, "Nhập mật khẩu VPN");
        passwordBox.UseSystemPasswordChar = true;
        AddField(card, "Fingerprint SHA256 của chứng chỉ máy chủ", pinBox, 20, 256, 538, "64 ký tự hex nhận trực tiếp từ máy A");
        pinBox.CharacterCasing = CharacterCasing.Upper;
        card.Controls.Add(NewLabel("Không lưu mật khẩu hoặc fingerprint; không có tùy chọn bỏ xác thực chứng chỉ.", 20, 325, 538, 24, 9, false, Muted));

        connectButton.Text = "Kết nối VPN";
        connectButton.SetBounds(20, 523, 280, 43);
        connectButton.BackColor = Accent; connectButton.ForeColor = Color.White; connectButton.FlatStyle = FlatStyle.Flat;
        connectButton.FlatAppearance.BorderSize = 0;
        connectButton.Click += async (_, _) => await ConnectAsync();
        Controls.Add(connectButton);
        disconnectButton.Text = "Ngắt kết nối";
        disconnectButton.SetBounds(320, 523, 280, 43);
        disconnectButton.Enabled = false;
        disconnectButton.Click += (_, _) => connectionStop?.Cancel();
        Controls.Add(disconnectButton);

        statusLabel.SetBounds(24, 582, 420, 26);
        statusLabel.Text = "●  Chưa kết nối"; statusLabel.ForeColor = Muted; statusLabel.Font = new Font(Font, FontStyle.Bold);
        Controls.Add(statusLabel);
        addressLabel.SetBounds(425, 582, 170, 26);
        addressLabel.Text = "IP VPN: —"; addressLabel.TextAlign = ContentAlignment.MiddleRight;
        Controls.Add(addressLabel);

        testButton.Text = "Thử kết nối 10.8.0.1:8080";
        testButton.SetBounds(20, 620, 580, 36);
        testButton.Enabled = false;
        testButton.Click += async (_, _) => await TestTunnelAsync();
        Controls.Add(testButton);

        logBox.SetBounds(20, 669, 580, 63);
        logBox.BackColor = Color.White; logBox.BorderStyle = BorderStyle.FixedSingle;
        logBox.HorizontalScrollbar = true;
        Controls.Add(logBox);
        WriteLog("Sẵn sàng. Hãy chạy server trên laptop A trước khi kết nối.");
    }

    private static Label NewLabel(string text, int x, int y, int width, int height, float size, bool bold, Color color) =>
        new() { Text = text, Left = x, Top = y, Width = width, Height = height,
            Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), ForeColor = color };

    private static void AddField(Control parent, string title, TextBox field, int x, int y, int width, string placeholder)
    {
        parent.Controls.Add(NewLabel(title, x, y, width, 22, 9, true, Ink));
        field.SetBounds(x, y + 24, width, 29);
        field.PlaceholderText = placeholder;
        field.BorderStyle = BorderStyle.FixedSingle;
        parent.Controls.Add(field);
    }

    private async Task ConnectAsync()
    {
        if (connecting) return;
        if (!int.TryParse(portBox.Text.Trim(), out int port)) { ShowError("Cổng VPN phải là số."); return; }
        string password = passwordBox.Text;
        passwordBox.Clear();
        var options = new VpnOptions(serverBox.Text.Trim(), port, userBox.Text.Trim(), password, pinBox.Text.Trim());
        connectionStop = new CancellationTokenSource();
        connecting = true;
        bool failed = false;
        connectButton.Enabled = false; disconnectButton.Enabled = true; testButton.Enabled = false;
        SetState(new("Đang kết nối…"));
        try
        {
            await Task.Run(() => VpnConnection.RunAsync(options, state =>
            {
                if (!IsDisposed && IsHandleCreated)
                    try { BeginInvoke((Action)(() => { if (connecting) SetState(state); })); } catch (InvalidOperationException) { }
            }, connectionStop.Token));
        }
        catch (OperationCanceledException) { WriteLog("Đã ngắt VPN."); }
        catch (AuthenticationException) { failed = true; ShowError("Chứng chỉ máy chủ không khớp fingerprint hoặc TLS bị từ chối."); }
        catch (DllNotFoundException) { failed = true; ShowError("Thiếu wintun.dll cạnh MiniVpn.Desktop.exe."); }
        catch (Win32Exception ex) { failed = true; ShowError("Wintun/Windows báo lỗi: " + ex.Message + ". Hãy kiểm tra quyền Administrator."); }
        catch (UnauthorizedAccessException ex) { failed = true; ShowError(ex.Message); }
        catch (Exception ex) { failed = true; ShowError(ex.Message); }
        finally
        {
            connectionStop.Dispose(); connectionStop = null;
            connecting = false;
            connectButton.Enabled = true; disconnectButton.Enabled = false; testButton.Enabled = false;
            if (!failed) { statusLabel.Text = "●  Chưa kết nối"; statusLabel.ForeColor = Muted; }
            addressLabel.Text = "IP VPN: —";
            if (closeRequested) Close();
        }
    }

    private void SetState(VpnState state)
    {
        statusLabel.Text = "●  " + state.Message;
        statusLabel.ForeColor = state.Address is null ? Accent : Color.FromArgb(18, 137, 79);
        addressLabel.Text = state.Address is null ? "IP VPN: —" : "IP VPN: " + state.Address;
        testButton.Enabled = state.Address is not null;
        WriteLog(state.Message);
    }

    private async Task TestTunnelAsync()
    {
        testButton.Enabled = false;
        try
        {
            using var client = new TcpClient(AddressFamily.InterNetwork);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await client.ConnectAsync(IPAddress.Parse("10.8.0.1"), 8080, timeout.Token);
            WriteLog("Thành công: đã mở TCP tới 10.8.0.1:8080 qua VPN.");
        }
        catch (Exception ex) { WriteLog("Chưa tới được 10.8.0.1:8080: " + ex.Message); }
        finally { testButton.Enabled = connecting && addressLabel.Text != "IP VPN: —"; }
    }

    private void ShowError(string message)
    {
        WriteLog("Lỗi: " + message);
        statusLabel.Text = "●  Lỗi kết nối";
        statusLabel.ForeColor = Color.FromArgb(190, 51, 61);
    }

    private void WriteLog(string message)
    {
        logBox.Items.Add($"{DateTime.Now:HH:mm:ss}  {message}");
        logBox.TopIndex = logBox.Items.Count - 1;
        while (logBox.Items.Count > 100) logBox.Items.RemoveAt(0);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (connecting)
        {
            e.Cancel = true; closeRequested = true; connectionStop?.Cancel();
            return;
        }
        base.OnFormClosing(e);
    }
}
