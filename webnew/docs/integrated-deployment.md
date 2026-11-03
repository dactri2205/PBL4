# Chạy website An Việt và quản trị MiniVPN đã ghép

`webnew` là thư mục website duy nhất. Frontend và backend nghiệp vụ giữ mã Node.js/PostgreSQL của website mới; gateway .NET phục vụ frontend và nối quyền ADMIN thật với dịch vụ VPN đang chạy.

```text
Laptop B ─ TLS VPN ─ Laptop A / MiniVpn.Server
                         10.8.0.1:8080 (TCP relay)
                                  │
                         127.0.0.1:18080 / MiniVpn.InternalWeb
                          ├─ FE từ webnew/frontend
                          ├─ /api/* → 127.0.0.1:13000 / Node.js → PostgreSQL
                          └─ /api/vpn/* → 127.0.0.1:18181 / control API MiniVPN
```

API Node.js chỉ publish loopback; PostgreSQL không publish ra host/LAN. Control API vẫn trong process MiniVPN, chỉ bind loopback và yêu cầu service token. Nginx là profile xem riêng website, không giữ cổng `18080` trong bản ghép.

## 1. Chuẩn bị và khởi động backend

Tại thư mục gốc PBL4:

```powershell
Copy-Item .\webnew\.env.example .\webnew\.env
```

Đặt mật khẩu riêng đủ mạnh cho `POSTGRES_ADMIN_PASSWORD` và `POSTGRES_APP_PASSWORD` trong `.env` (bỏ qua Git); giữ `COOKIE_SECURE=true` cho HTTPS. Nếu đã có `.env`, dùng lại và không chép đè. Nếu có DB cũ, sao lưu trước khi áp dụng migration mới.

```powershell
Push-Location .\webnew
docker compose up -d --build
docker compose exec -it api npm run set-password -- hoangan
Pop-Location
```

Lệnh CLI yêu cầu nhập mật khẩu ẩn, không có mật khẩu đăng nhập mặc định. Tài khoản `hoangan` trong seed có role ADMIN. Các DB đã có dữ liệu dùng ADMIN hiện có, không chạy lại seed bằng tay. `070_session_auth_version.sql` bổ sung epoch xác thực; runner áp dụng migration mới theo transaction/checksum và không sửa migrations cũ.

Trong môi trường chưa có Docker, có thể chạy Node trực tiếp với PostgreSQL đã cấu hình `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`, áp dụng migrations trước và đặt `PORT=13000`, `HOST=127.0.0.1`. Không chạy migrator với user ứng dụng; migrator cần quyền quản trị schema, còn API dùng `anviet_app`.

## 2. Cấu hình gateway và VPN

```powershell
Copy-Item .\config\vpn-management.example.json .\vpn-management.local.json
$env:MINIVPN_CONFIG = (Resolve-Path .\vpn-management.local.json).Path
```

Dùng lại file nếu đã có. Giữ `VpnAdmin.AuthenticationMode="Portal"`, `TemporaryLoginEnabled=false` và `Portal.ApiBaseUrl="http://127.0.0.1:13000/"`. Cấp cùng `MINIVPN_CONTROL_TOKEN` ngẫu nhiên ít nhất 32 ký tự cho terminal Server, gateway và watchdog qua secret/môi trường riêng; không đặt trong frontend, source, ảnh chụp hoặc tham số lệnh. `MINIVPN_CONFIG` cần cùng đường dẫn tuyệt đối trong các terminal.

Trong PowerShell Administrator trên A, chạy VPN như trước, với `MINIVPN_PFX_PASSWORD` và Wintun chính thức đã chuẩn bị:

```powershell
dotnet run --project .\src\MiniVpn.Server -c Release -- 192.168.1.10 .\certs\server.pfx .\accounts.json 42424
```

Thay IP LAN bằng IP thật. Firewall, chứng chỉ VPN và route theo [hướng dẫn VPN](../../docs/02-vpn-checkpoint.md). `accounts.json` vẫn là kho tài khoản VPN độc lập, không chuyển sang bảng `users` của website.

## 3. HTTPS cho website

Nạp `MINIVPN_WEB_PFX_PASSWORD` từ secret của bạn, rồi tạo chứng chỉ lab nếu chưa có:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Make-WebCertificate.ps1
```

Script tạo `certs/web.pfx` và `certs/web.cer` có SAN `localhost`, `127.0.0.1`, `10.8.0.1`, không ghi đè chứng chỉ cũ. Đặt `VpnWeb.HttpsCertificatePath` trong cấu hình local bằng đường dẫn PFX **tuyệt đối** và `VpnManagement.WebHealthUseHttps=true`. Chứng chỉ website khác chứng chỉ TLS VPN dùng fingerprint.

Sau khi đối chiếu SHA256 qua kênh tin cậy, tin cậy certificate công khai trên A (tài khoản chạy monitor) và các client lab:

```powershell
certutil -user -addstore Root .\certs\web.cer
```

Chỉ chuyển file `.cer` công khai cho client, giữ PFX/password trên A. Production dùng certificate/chain phù hợp, không tắt kiểm tra chứng chỉ. Monitor dùng xác thực TLS mặc định, nên A cũng cần tin cậy certificate và SAN phải hợp lệ cho `127.0.0.1`.

Chạy gateway tại gốc PBL4, cùng config/token và `MINIVPN_WEB_PFX_PASSWORD`:

```powershell
dotnet run --project .\src\MiniVpn.InternalWeb -c Release
```

Trên A mở `https://127.0.0.1:18080/`. Trên B sau khi kết nối MiniVPN, mở `https://10.8.0.1:8080/`. Đăng nhập website bằng ADMIN thật, mở menu tài khoản → **Quản trị VPN** hoặc `/vpn-admin.html`. Không cần tài khoản admin VPN thứ hai. EMPLOYEE nhận 403, phiên hết hạn/đã thu hồi nhận 401. Logout ở dashboard cũng kết thúc phiên website hiện tại.

## Demo HTTP có cấu hình rõ ràng

Chỉ dùng khi cần demo trong Development qua tunnel: đặt `COOKIE_SECURE=false` trong `webnew/.env`, tạo lại container API bằng `docker compose up -d --force-recreate api`. Terminal gateway đặt `ASPNETCORE_ENVIRONMENT=Development` và `VpnAdmin__AllowInsecureHttpDevelopment=true`, bỏ PFX HTTPS cho lần demo và đặt `WebHealthUseHttps=false`. Dùng URL `http://...` tương ứng. Không bật `TemporaryLoginEnabled`; đăng nhập vẫn dùng PostgreSQL. Production từ chối cấu hình cookie HTTP này ở gateway.

## Khởi động ba dịch vụ bằng một lệnh

Sau khi chuẩn bị backend, `vpn-management.local.json`, chứng chỉ và Wintun theo các bước trên, mở **PowerShell bằng Run as administrator** rồi chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\DaiHoc\Project\PBL4\scripts\Start-Server.ps1" -ServerIp "192.168.1.9"
```

Thay đường dẫn nếu dự án nằm ở nơi khác; thay IP bằng IPv4 LAN thật của laptop A (`ipconfig`). Script tự tìm thư mục dự án từ vị trí file, không cần biến `$root` hoặc `$serverIp`. Nếu PowerShell đang hiện dấu `>>`, nhấn **Ctrl+C** rồi dán lại cả lệnh trên.

Script build một lần, hỏi mật khẩu đã dùng để tạo `server.pfx` và chứng chỉ website bằng ô nhập ẩn nếu chưa có trong môi trường, rồi mở ba cửa sổ Server, InternalWeb và Watchdog với cùng cấu hình/token. Đây là mật khẩu chứng chỉ, không phải mật khẩu đăng nhập website hay VPN. Khi chưa có token, script tạo token ngẫu nhiên dùng chung cho lần chạy; token không được in ra. Script không khởi động Docker và không thay đổi tài khoản, chứng chỉ hay firewall. Kiểm tra log trong cả ba cửa sổ sau khi mở.

Lỗi `WorkingDirectory ... null or empty` ở các lệnh `Start-Process` cũ nghĩa là `$root` chưa được khai báo trong cửa sổ PowerShell đó. Biến của terminal VS Code không tự chuyển sang cửa sổ Administrator mở riêng. Dùng script trên để tránh phụ thuộc vào các biến này. Nếu một dịch vụ cũ vẫn đang giữ cổng, dừng dịch vụ đó bằng Ctrl+C trước khi chạy lại.

Có thể thêm `-ValidateOnly` để kiểm tra đường dẫn, cấu hình và IP mà không mở dịch vụ, build hay yêu cầu mật khẩu.

Script mặc định dùng `certs/server.pfx`. Sau khi mở PFX, script kiểm tra hạn chứng chỉ và in **VPN SHA256 fingerprint** để nhập trên client B. Nếu chứng chỉ hết hạn, script dừng trước khi mở dịch vụ; nhập lại fingerprint của chứng chỉ hết hạn vẫn không kết nối được. Muốn dùng chứng chỉ khác đã có, dừng ba dịch vụ cũ bằng Ctrl+C rồi chạy, ví dụ:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\DaiHoc\Project\PBL4\scripts\Start-Server.ps1" -ServerIp "192.168.1.9" -VpnCertificatePath "certs\server-new.pfx"
```

Nhập mật khẩu gốc của PFX được chọn. Chứng chỉ thay thế cũng phải còn hạn. Dùng fingerprint mới do script in ra; không dùng fingerprint của `web.pfx` hoặc hash của cả file PFX. Nếu cần tạo chứng chỉ VPN mới, dùng `Make-DemoCertificate.ps1` với đường dẫn đầu ra mới theo hướng dẫn VPN, không ghi đè chứng chỉ đang dùng. Client EXE cũ hiện thông báo TLS chung; bản EXE mới phân biệt hết hạn, chưa có hiệu lực và sai fingerprint. Kiểm tra ngày giờ trên cả A/B khi chứng chỉ chưa có hiệu lực.

## 4. Watchdog, vận hành và kiểm thử

Terminal riêng A, cùng config/token và secret Telegram/Discord nếu dùng:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Run-VpnWatchdog.ps1
```

Xem [quản trị VPN](../../docs/05-vpn-administration.md) cho tài khoản, log, retention, ngắt phiên, cảnh báo, watchdog và script phục hồi. Nếu Node/DB không phản hồi, gateway không sử dụng role admin cũ và `/healthz` báo 503; không fallback mock. `?demo=1` chỉ thay dữ liệu xem thử nghiệp vụ, không cấp quyền VPN. Link đăng nhập từ dashboard dùng `real=1` để thoát preview và `returnTo` theo allowlist, tránh chuyển hướng ra URL bên ngoài.

Kiểm tra cơ bản:

```powershell
dotnet build .\MiniVpn.sln -c Release
dotnet run --project .\tests\MiniVpn.Smoke -c Release
Push-Location .\webnew
npm.cmd run check
npm.cmd test
Pop-Location
```

Kiểm thử tích hợp đầy đủ cần Docker chạy, Chrome và dependency backend (`npm.cmd ci --ignore-scripts` trong `webnew/backend`):

```powershell
$env:MINIVPN_FULL_STACK_TEST = '1'
$env:MINIVPN_BROWSER_TEST = '1'
dotnet run --project .\tests\MiniVpn.Management.Tests -c Release
Remove-Item Env:\MINIVPN_FULL_STACK_TEST,Env:\MINIVPN_BROWSER_TEST
```

Test tạo PostgreSQL 17/container riêng tên `pbl4-merge-test-*`, mật khẩu ngẫu nhiên chỉ qua stdin/environment, chạy migration hai lần, dùng BE thật và gateway HTTPS. Chứng chỉ thử nghiệm được pin riêng cho client/Chrome; không thay trust store hệ điều hành. Container tự dọn khi kết thúc. Không dùng database/tài khoản thật. Test kiểm tra SSO ADMIN/EMPLOYEE, CSRF, cookie Secure, hết hạn/khóa/đổi quyền/reset/logout, race cấp phiên, API nghiệp vụ, thu hồi TLS VPN thật và giao diện laptop/tablet. Wintun và đường đi trên hai laptop vẫn cần checklist manual trong tài liệu VPN.
