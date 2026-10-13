# Giai đoạn 3–4: biên dịch và kiểm tra đường hầm

## Trạng thái kiểm tra tại workspace

`dotnet build MiniVpn.sln` thành công: 0 cảnh báo, 0 lỗi. Sau khi chính sách chạy ứng dụng của Windows thay đổi, `dotnet run --project tests/MiniVpn.Smoke` đã chạy và đạt **8/8 kiểm tra**. Gói Wintun 0.14.1 từ [trang chính thức](https://www.wintun.net/) đã được tải, DLL AMD64 có chữ ký hợp lệ của WireGuard LLC và đã đặt cạnh bản build Release của server/client/Desktop. Phiên công cụ hiện tại không có quyền Administrator, nên Wintun, TLS qua LAN, route và relay **chưa kiểm chứng trên máy thật**.

## Chuẩn bị trên A và B

1. Mở PowerShell **Run as Administrator**. Chạy `powershell -ExecutionPolicy Bypass -File .\scripts\Preflight.ps1` trên mỗi máy. A cần Docker Desktop; giai đoạn này chưa cần khởi động website.
2. Cài .NET 10 SDK hoặc runtime Windows x64. Tải bản Wintun chính thức từ [wintun.net](https://www.wintun.net/), lấy `wintun.dll` trong thư mục `bin\amd64` của gói chính thức. Đặt một bản cạnh file `MiniVpn.Server.exe` trên A và cạnh `MiniVpn.Client.exe` trên B. Không dùng DLL không rõ nguồn. [API Wintun](https://git.zx2c4.com/wintun/tree/api/wintun.h) quy định vòng đời adapter/session.
3. Sao chép toàn bộ repository sang A/B hoặc build từ source trên mỗi máy:

```powershell
dotnet build .\MiniVpn.sln -c Release
dotnet run --project .\tests\MiniVpn.Smoke\MiniVpn.Smoke.csproj -c Release
```

Kết quả mong đợi của smoke test: `8 smoke checks passed`. Nếu Application Control chặn, cần chạy trong môi trường cho phép chương trình tự biên dịch, rồi ghi lại chính sách chặn. Không vô hiệu hóa chính sách bảo mật một cách tùy tiện.

## A: chứng chỉ, tài khoản, firewall

Chọn IP LAN A/B từ kết quả preflight, ví dụ A `192.168.1.10`, B `192.168.1.11`. Ví dụ dưới đây thay các giá trị cho mạng thật.

Trong workspace hiện tại đã tạo `certs/server.pfx` bằng [Make-DemoCertificate.ps1](../scripts/Make-DemoCertificate.ps1) với **mật khẩu PFX demo `123456`**, cùng `accounts.json` chứa hash cho `alice` và `bob`. Hai file bị `.gitignore` bỏ qua; nếu chép chỉ mã nguồn sang A, hãy tạo lại PFX bằng `$env:MINIVPN_PFX_PASSWORD = '123456'; powershell -ExecutionPolicy Bypass -File .\scripts\Make-DemoCertificate.ps1`, rồi tạo hai tài khoản bằng `add-user`. Script in fingerprint SHA256 cần chuyển tin cậy sang B. Mật khẩu PFX không phải mật khẩu tài khoản VPN. Đổi sang mật khẩu mạnh hơn khi dùng ngoài buổi demo.

```powershell
$env:MINIVPN_PFX_PASSWORD = '123456'
if (-not (Test-Path .\certs\server.pfx)) { powershell -ExecutionPolicy Bypass -File .\scripts\Make-DemoCertificate.ps1 }
$cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path .\certs\server.pfx).Path, $env:MINIVPN_PFX_PASSWORD, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
$fingerprint = [BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash($cert.RawData)).Replace('-','')
$fingerprint
$cert.Dispose()
if (-not (Test-Path .\accounts.json)) {
    dotnet run --project .\src\MiniVpn.Server\MiniVpn.Server.csproj -c Release -- add-user .\accounts.json alice
    dotnet run --project .\src\MiniVpn.Server\MiniVpn.Server.csproj -c Release -- add-user .\accounts.json bob
}
New-NetFirewallRule -DisplayName 'MiniVPN TLS LAN' -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalAddress '192.168.1.10' -RemoteAddress '192.168.1.11' -LocalPort 42424
```

Sao chép fingerprint (64 ký tự hex) **bằng kênh tin cậy** sang B trước khi kết nối (ví dụ đối chiếu trực tiếp trên màn hình A/B hoặc USB). Không lấy fingerprint từ chính kết nối chưa xác thực. Mật khẩu PFX chỉ ở biến môi trường của phiên PowerShell và `server.pfx` trên A; sau demo chạy `Remove-Item Env:\MINIVPN_PFX_PASSWORD`. Hai mật khẩu VPN lưu dưới dạng PBKDF2-SHA256 với salt 16 byte, 310.000 vòng trong `accounts.json`. Chỉ tài khoản Windows chạy server được đọc file này; kiểm tra ACL bằng `icacls .\accounts.json`.

Chạy server từ PowerShell Administrator A (giữ cửa sổ mở):

```powershell
dotnet run --project .\src\MiniVpn.Server\MiniVpn.Server.csproj -c Release -- 192.168.1.10 .\certs\server.pfx .\accounts.json 42424
```

`192.168.1.10` chỉ là ví dụ. Tại lần khảo sát gần nhất, IP Wi-Fi của laptop A là `172.31.99.11` (`ipconfig`); nếu IP chưa đổi, thay IP trong lệnh bằng giá trị đó. Server sẽ báo lỗi rõ nếu địa chỉ nhập không thuộc máy đang chạy.

Server tạo `MiniVpn-Server`, gắn `10.8.0.1/24` trong ActiveStore và relay `10.8.0.1:8080`. Ở cửa sổ Administrator khác trên A, mở chỉ cổng relay trên adapter VPN:

```powershell
New-NetFirewallRule -DisplayName 'MiniVPN web over tunnel' -Direction Inbound -Action Allow -Profile Any -Protocol TCP -InterfaceAlias 'MiniVpn-Server' -LocalAddress '10.8.0.1' -RemoteAddress '10.8.0.0/24' -LocalPort 8080
New-NetFirewallRule -DisplayName 'MiniVPN echo over tunnel' -Direction Inbound -Action Allow -Profile Any -Protocol ICMPv4 -IcmpType 8 -InterfaceAlias 'MiniVpn-Server' -LocalAddress '10.8.0.1' -RemoteAddress '10.8.0.0/24'
Get-NetIPAddress -InterfaceAlias 'MiniVpn-Server' -AddressFamily IPv4
Get-NetTCPConnection -LocalAddress '10.8.0.1' -LocalPort 8080 -State Listen
```

Kết quả mong đợi: IP `10.8.0.1`, relay lắng nghe ở 8080. Server chỉ bind VPN TLS trên IP LAN A, không bind `0.0.0.0`. Khi Docker chưa chạy, relay bắt được TCP nhưng không có backend; `Test-NetConnection` vẫn có thể báo kết nối thành công, còn HTTP sẽ thất bại. Đây là phép thử đường hầm trước website.

## B: kết nối và chứng minh route

Trước khi kết nối, trên B:

```powershell
Test-NetConnection 10.8.0.1 -Port 8080
Test-NetConnection 192.168.1.10 -Port 8080
Test-NetConnection 192.168.1.10 -Port 18080
```

Ba phép thử phải thất bại (trừ khi trong LAN có thiết bị khác dùng `10.8.0.1`, khi đó phải đổi dải VPN trước khi chạy). Chạy client trong PowerShell Administrator B:

```powershell
dotnet run --project .\src\MiniVpn.Client\MiniVpn.Client.csproj -c Release -- 192.168.1.10 42424 alice <SHA256_FINGERPRINT_CUA_A>
```

Nếu muốn dùng cửa sổ thay cho client dòng lệnh, mở [hướng dẫn MiniVpn.Desktop](03-desktop-ui.md); hai cách dùng chung mã kết nối.

Sau khi hiện `Connected: 10.8.0.2`, mở PowerShell khác:

```powershell
Get-NetRoute -DestinationPrefix '10.8.0.1/32' | Format-Table InterfaceIndex,NextHop,DestinationPrefix
Get-NetIPAddress -IPAddress '10.8.0.2'
Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Format-Table InterfaceIndex,NextHop,RouteMetric
Test-NetConnection 10.8.0.1 -Port 8080
```

Route `10.8.0.1/32` phải trỏ `InterfaceIndex` của Wintun B, `NextHop 0.0.0.0`; default route không thay đổi. TCP 8080 phải thành công. `ping 10.8.0.1` có thể dùng nếu rule ICMP đã mở. Trên A phải có log `connected` và IP VPN tương ứng. Nhấn Ctrl+C ở B, kiểm tra `10.8.0.1/32` và địa chỉ `10.8.0.2` đã biến mất và kết nối 8080 thất bại. Thử fingerprint sai phải bị TLS từ chối trước khi gửi đăng nhập.

Thử phiên thứ hai bằng tài khoản `bob` từ một máy Windows khác trong LAN để kiểm tra hai đường hầm đầy đủ; thêm địa chỉ LAN máy đó vào một rule TLS tương tự rule dành cho B. Nếu chỉ có A/B, có thể chạy hai client trên B nhưng hai route giống hệt nhau sẽ tranh chọn đường, nên chưa đủ để chứng minh hai đường hầm truy cập web độc lập. Server cấp IP duy nhất cho hai phiên; cần ghi cả hai log và quan sát chúng còn sống đồng thời.

## Dọn dẹp và khôi phục sau crash

Thoát bằng Ctrl+C sẽ xóa địa chỉ/route ActiveStore và đóng adapter. Nếu process bị kill đột ngột, trên chính máy đó kiểm tra đúng `InterfaceIndex` của `MiniVpn-Client-alice` hoặc `MiniVpn-Server` trước khi xóa:

```powershell
Get-NetAdapter -Name 'MiniVpn-*' | Format-Table Name,InterfaceIndex,Status
Get-NetRoute -InterfaceIndex <INDEX> -ErrorAction SilentlyContinue
Get-NetIPAddress -InterfaceIndex <INDEX> -AddressFamily IPv4 -ErrorAction SilentlyContinue
Remove-NetRoute -InterfaceIndex <INDEX> -DestinationPrefix '10.8.0.1/32' -Confirm:$false -ErrorAction SilentlyContinue
Remove-NetIPAddress -InterfaceIndex <INDEX> -IPAddress '10.8.0.2' -Confirm:$false -ErrorAction SilentlyContinue
```

Thay `10.8.0.2` bằng IP của phiên đó; trên A dùng `10.8.0.1`. Nếu adapter cũ vẫn còn sau crash, xác nhận instance ID của **đúng adapter MiniVpn** bằng `Get-PnpDevice -FriendlyName 'MiniVpn-*'` rồi xóa đúng ID bằng `pnputil /remove-device '<INSTANCE_ID>'` trong Administrator PowerShell. Không xóa adapter mạng khác. Xóa firewall sau demo:

```powershell
Get-NetFirewallRule -DisplayName 'MiniVPN *' | Remove-NetFirewallRule
```

## Lỗi thường gặp

| Triệu chứng | Kiểm tra |
| --- | --- |
| `wintun.dll` missing | Đặt DLL amd64 chính thức cạnh `.exe` của mỗi ứng dụng; chạy build Release đúng kiến trúc x64. |
| `Access denied` khi tạo adapter/route | Chạy PowerShell Administrator; xem `Preflight.ps1`. |
| TLS certificate rejected | Đối chiếu fingerprint SHA256, ngày giờ hệ thống, chứng chỉ A và cổng LAN đúng. Không tắt xác thực. |
| Server ghi `platform does not support ephemeral keys` | Dừng server bằng Ctrl+C, cập nhật mã nguồn mới và build lại trên A. Server cần nạp PFX bằng `UserKeySet` để Schannel trên Windows dùng được khóa riêng. Lỗi này xảy ra trước khi kiểm tra mật khẩu VPN. |
| TCP 42424 thất bại | Kiểm tra hai IP LAN, Wi-Fi client isolation, Windows Firewall profile và rule chỉ cho B. |
| Kết nối VPN nhưng 8080 thất bại | So sánh `InterfaceIndex`, IP/route, rule firewall Wintun trên A và log server; kiểm tra xung đột dải 10.8.0.0/24. |
| 8080 thành công nhưng trang không tải | Đúng ở giai đoạn 4 vì website chưa chạy; giai đoạn 5 mới cần Docker `127.0.0.1:18080`. |

Giao thức khung: 1 byte version (`1`), 1 byte type, 4 byte độ dài big endian, payload tối đa 2048 byte; IP packet tối đa 1500 byte. `Login`, `Welcome`, `Denied`, `Packet` chỉ chạy trong TLS. Client pin SHA256 chứng chỉ; không có tùy chọn bỏ qua. Mỗi packet IPv4 được kiểm tra nguồn, đích, không phân mảnh và chỉ cho TCP web 8080 hoặc ICMP echo. Bọc TCP trong TLS/TCP tạo head-of-line blocking và có thể giảm hiệu năng khi mất gói.
