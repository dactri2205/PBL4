# Phát hành MiniVPN Client dạng một EXE

Bản client Windows x64 được tạo từ MiniVpn.Desktop (Windows Forms). Chỉ cần chuyển `artifacts/client-win-x64/MiniVpn.Desktop.exe` sang laptop B; không cần sao chép source, cài .NET SDK/runtime hoặc chạy Docker trên B. Runtime .NET và DLL Wintun chính thức được nhúng trong EXE.

Cách đóng gói dùng [single-file self-contained của .NET](https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/overview). Khi chạy, các thư viện native được giải nén tự động vào cache theo cơ chế .NET; không có DLL rời phải chuyển thủ công. License gốc Wintun được nhúng và có thể xem bằng nút Giấy phép Wintun.

## Sử dụng trên laptop client

1. Nhận EXE qua kênh tin cậy và mở ứng dụng. Chấp nhận yêu cầu Administrator/UAC để MiniVPN tạo adapter Wintun và route.
2. Nhập IP LAN của laptop A, cổng VPN (thường 42424), tài khoản/mật khẩu VPN và fingerprint SHA256 nhận qua kênh tin cậy từ A. App không có mật khẩu mặc định và không lưu mật khẩu/fingerprint ra file.
3. Nhấn Kết nối VPN. Khi TLS, đăng nhập, Wintun và route hoàn thành, app tự mở `https://10.8.0.1:8080/`. Có thể bỏ tùy chọn tự mở và nhấn Mở website nội bộ.
4. Đăng nhập website bằng tài khoản website. Tài khoản VPN cho phép đi qua tunnel; ADMIN/EMPLOYEE của website vẫn do backend xác thực riêng.
5. Giữ ứng dụng chạy khi dùng web. Nhấn Ngắt kết nối hoặc đóng cửa sổ để dọn route/IP.

Tùy chọn Website dùng HTTP chỉ dành cho server đã cấu hình Development HTTP rõ ràng. App không tự tắt TLS, bỏ fingerprint hoặc tự tin cậy certificate website. Với certificate website lab, cài public certificate đã đối chiếu trên B theo [hướng dẫn tích hợp](../webnew/docs/integrated-deployment.md); production dùng certificate được tin cậy phù hợp.

Laptop A vẫn phải chạy backend/DB, VPN server, gateway website và cấu hình firewall như [hướng dẫn](../webnew/docs/integrated-deployment.md). EXE client không chứa/chạy máy chủ website, database hoặc service token. Client không cần Docker. Bản này dành cho Windows x64; hệ điều hành/kiến trúc khác cần bản phát hành tương ứng.

## Tạo lại EXE trên máy phát triển

Cần .NET 10 SDK, mạng để tải runtime packs lần đầu, cùng Wintun AMD64 chính thức có chữ ký hợp lệ và LICENSE.txt gốc.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Publish-Client.ps1
```

Script mặc định lấy DLL đã tải ở `.download/wintun-0.14.1/wintun/bin/amd64/wintun.dll`. Nếu lưu ở chỗ khác:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Publish-Client.ps1 -WintunDllPath 'C:\tools\wintun\bin\amd64\wintun.dll' -WintunLicensePath 'C:\tools\wintun\LICENSE.txt'
```

Script kiểm tra chữ ký/kiến trúc DLL, publish self-contained win-x64 một file với native extraction và không trim WinForms. Không đóng gói accounts.json, PFX/private key, password, token hay cấu hình server. Output mặc định là `artifacts/client-win-x64/MiniVpn.Desktop.exe`, thư mục artifacts bị bỏ qua Git. Script chỉ thay đúng EXE đích, không xóa thư mục đầu ra của người dùng.

## Kiểm chứng bản phát hành

Script tự chạy EXE với --self-test từ working directory trống và tắt runtime discovery. Test nạp Wintun qua cơ chế native resolution thật, xác minh export/hash DLL nhúng khớp bản gốc, license có trong EXE và khởi tạo WinForms với nút mở web bị khóa khi chưa kết nối. Không tạo adapter, thay route, mở browser hay yêu cầu UAC trong self-test.

```powershell
$check = Start-Process -FilePath .\artifacts\client-win-x64\MiniVpn.Desktop.exe -ArgumentList '--self-test' -WindowStyle Hidden -PassThru -Wait
$check.ExitCode
Get-FileHash .\artifacts\client-win-x64\MiniVpn.Desktop.exe -Algorithm SHA256
```

Kiểm tra đóng gói không thay phép thử tunnel thật bằng Administrator trên A/B. Cần xác nhận cấp IP, route, tải website, ngắt/thu hồi phiên và dọn tài nguyên trên hai laptop. Nếu Windows chặn EXE mới biên dịch theo chính sách ứng dụng, dùng bản được ký bởi bên phát hành tin cậy hoặc môi trường cho phép chạy bản phát triển; không tắt cơ chế xác thực/chính sách trong app.
