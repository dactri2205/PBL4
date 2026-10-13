# Chạy giao diện Mini VPN trên Windows

Ứng dụng cửa sổ là `MiniVpn.Desktop` (Windows Forms, .NET 10). Nó dùng chung mã kết nối trong `MiniVpn.ClientCore` với client dòng lệnh. Cửa sổ có IP LAN server, cổng, tài khoản, mật khẩu, fingerprint SHA256, nút Kết nối/Ngắt, trạng thái/IP VPN, log và nút thử TCP tới `10.8.0.1:8080`. [Microsoft hướng dẫn dùng Windows Forms trong .NET hiện đại](https://learn.microsoft.com/en-us/dotnet/desktop/winforms/migration/how-to-upgrade-winforms) và cập nhật giao diện từ luồng nền [tại đây](https://learn.microsoft.com/en-us/dotnet/desktop/winforms/controls/how-to-make-thread-safe-calls).

## Xem giao diện ngay (chưa cần server)

Mở terminal tại thư mục gốc dự án:

```powershell
dotnet build .\MiniVpn.sln -c Release
powershell -ExecutionPolicy Bypass -File .\scripts\Run-Desktop.ps1
```

Hoặc mở file `src\MiniVpn.Desktop\bin\Release\net10.0-windows\MiniVpn.Desktop.exe`. Script trên chạy DLL bằng `dotnet` để hiện lỗi khởi động trong terminal; `dotnet run` với `WinExe` có thể thoát mà không cho thấy lỗi. Giao diện có thể mở không cần Wintun hay quyền Administrator nếu chính sách Windows cho phép chạy assembly mới biên dịch. Khi chưa có server, nút Kết nối sẽ báo lỗi; đó không phải là kết quả thử VPN thành công.

Trong lần kiểm tra trước, `dotnet build` thành công nhưng **Windows Application Control** chặn tải `MiniVpn.Desktop.dll` (`0x800711C7`). Event `CodeIntegrity/Operational` ID `3077` ghi `PolicyName=VerifiedAndReputableDesktop`. Chính sách trên máy đã thay đổi và bộ smoke test hiện chạy 8/8, nhưng cửa sổ Desktop **chưa được kiểm chứng trực quan sau thay đổi đó**. Nếu lỗi chặn xuất hiện lại, kiểm tra trạng thái Smart App Control tại Windows Security → App & browser control. [Microsoft cho biết Smart App Control không có ngoại lệ từng ứng dụng](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions). Việc build thành công không tự chứng minh ứng dụng đã chạy.

## Kết nối thật từ laptop B

1. Làm bước chuẩn bị server A, tài khoản, chứng chỉ và firewall trong [02-vpn-checkpoint.md](02-vpn-checkpoint.md). A phải có server đang chạy. B cần quyền Administrator và `wintun.dll` x64 chính thức đặt **cạnh `MiniVpn.Desktop.exe`**. Không đặt fingerprint vào file cấu hình hoặc lấy qua kết nối chưa xác thực.
2. Trên B, mở **PowerShell Run as Administrator** và chạy:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\Run-Desktop.ps1
   ```

3. Nhập IP LAN của A (ví dụ `192.168.1.10`), cổng `42424`, tài khoản `alice`, mật khẩu VPN và fingerprint SHA256 64 ký tự đã đối chiếu từ A. Nhấn **Kết nối VPN**. Trạng thái dự kiến chuyển từ TLS → đăng nhập → tạo Wintun/route → `Đã kết nối — 10.8.0.2`.
4. Nhấn **Thử kết nối 10.8.0.1:8080**. Nếu server và firewall hoạt động, log báo mở TCP thành công. Đây là phép thử đường hầm; website Docker chưa được triển khai nên chưa có trang để xem.
5. Nhấn **Ngắt kết nối** hoặc đóng cửa sổ. Ứng dụng chờ xóa IP/route trước khi thoát. Kiểm tra `Get-NetRoute -DestinationPrefix '10.8.0.1/32'` để xác nhận route đã biến mất.

Nếu báo thiếu `wintun.dll`, sao chép đúng DLL amd64 vào thư mục chứa `.exe` của giao diện; DLL của client dòng lệnh ở thư mục khác không được dùng tự động. Nếu báo Access denied, chạy PowerShell Administrator. Nếu fingerprint sai, TLS sẽ từ chối trước bước đăng nhập VPN. Mật khẩu được xóa khỏi ô nhập khi nhấn Kết nối và không ghi vào log/file.
