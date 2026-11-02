# Demo website nội bộ chỉ truy cập qua MiniVPN

`MiniVpn.InternalWeb` là website mẫu chạy trên laptop A. Nó chỉ lắng nghe ở `127.0.0.1:18080`; MiniVPN server chuyển tiếp kết nối từ `10.8.0.1:8080` tới địa chỉ đó. Máy khác trong LAN không truy cập được cổng web trực tiếp bằng IP LAN của A. Đây là trang mẫu để chứng minh đường đi của website qua VPN; dự án chưa có database hoặc Docker Compose.

## 1. Laptop A: chạy website và VPN server

Mở PowerShell thứ nhất tại thư mục gốc dự án (không cần Administrator) và giữ cửa sổ mở:

```powershell
dotnet run --project .\src\MiniVpn.InternalWeb\MiniVpn.InternalWeb.csproj -c Release
```

Ứng dụng phải báo `Now listening on: http://127.0.0.1:18080`. Kiểm tra tại A:

```powershell
curl.exe --noproxy "*" http://127.0.0.1:18080/
```

Kết quả phải chứa `Website nội bộ`. Nếu cổng 18080 đã bị ứng dụng khác chiếm, dừng ứng dụng đó trước khi chạy website mẫu.

Mở PowerShell **Administrator** thứ hai tại thư mục gốc dự án. Thay hai IP ví dụ bằng IP LAN thực tế của A và B; không chạy lại `Make-DemoCertificate.ps1` nếu `certs/server.pfx` đã có.

```powershell
$serverLanIp = '192.168.106.106'
$clientLanIp = '192.168.106.165'
$env:MINIVPN_PFX_PASSWORD = '123456'
New-NetFirewallRule -DisplayName 'MiniVPN TLS LAN demo' -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalAddress $serverLanIp -RemoteAddress $clientLanIp -LocalPort 42424
dotnet run --project .\src\MiniVpn.Server\MiniVpn.Server.csproj -c Release -- $serverLanIp .\certs\server.pfx .\accounts.json 42424
```

Giữ server chạy. Nó phải báo `VPN listening ... web relay 10.8.0.1:8080`. Trong PowerShell Administrator thứ ba trên A, cho phép cổng web **chỉ trên adapter VPN**:

```powershell
New-NetFirewallRule -DisplayName 'MiniVPN web over tunnel' -Direction Inbound -Action Allow -Profile Any -Protocol TCP -InterfaceAlias 'MiniVpn-Server' -LocalAddress '10.8.0.1' -RemoteAddress '10.8.0.0/24' -LocalPort 8080
```

Nếu đã có rule cùng tên từ lần demo trước thì không cần tạo lại. A cần `wintun.dll` cạnh `MiniVpn.Server.exe`, PFX và `accounts.json` như [hướng dẫn VPN](02-vpn-checkpoint.md).

## 2. Laptop B: thử khi chưa kết nối VPN

Trước khi mở client VPN, chạy trên B:

```powershell
curl.exe --noproxy "*" --connect-timeout 5 http://192.168.106.106:18080/
curl.exe --noproxy "*" --connect-timeout 5 http://192.168.106.106:8080/
curl.exe --noproxy "*" --connect-timeout 5 http://10.8.0.1:8080/
```

Ba lệnh phải không trả về trang `Website nội bộ`. Thay `192.168.106.106` nếu IP LAN của A đã đổi. Nếu `10.8.0.1` trùng với thiết bị khác trong LAN, phải đổi dải VPN trước khi demo.

## 3. Laptop B: kết nối VPN rồi mở web

Chạy `scripts/Run-Desktop.ps1` từ PowerShell Administrator trên B. Điền IP LAN A, cổng `42424`, tài khoản và mật khẩu VPN, cùng fingerprint SHA256 của chứng chỉ A. B cần `wintun.dll` cạnh `MiniVpn.Desktop.exe`. Khi giao diện báo IP VPN (thường là `10.8.0.2`), mở trình duyệt trên B:

```text
http://10.8.0.1:8080/
```

Trang phải hiện tiêu đề `Website nội bộ` và thời gian máy chủ. Có thể kiểm tra bằng lệnh:

```powershell
curl.exe --noproxy "*" --connect-timeout 5 http://10.8.0.1:8080/
```

Ngắt VPN rồi thử lại URL này; trang phải không còn tải được. Lặp lại phép thử **chưa kết nối VPN** trên laptop C cùng LAN để chứng minh C có thể thấy IP LAN A nhưng không xem được web nội bộ. `Test-NetConnection` chỉ kiểm tra bắt tay TCP; phải kiểm tra nội dung HTTP để xác nhận website thực sự hoạt động.

## Kết quả cần ghi cho báo cáo

| Trạng thái | IP LAN A | Website qua IP LAN A:18080 | Website qua 10.8.0.1:8080 |
| --- | --- | --- | --- |
| B/C chưa kết nối VPN | Liên lạc được | Không truy cập được | Không tải được trang |
| B đã kết nối VPN | Liên lạc được | Không truy cập được | Hiện `Website nội bộ` |
| B đã ngắt VPN | Liên lạc được | Không truy cập được | Không tải được trang |

Website mẫu chỉ chứng minh kiến trúc truy cập qua VPN. Khi phát triển website thật, giữ backend chỉ lắng nghe ở `127.0.0.1:18080` hoặc publish Docker vào đúng địa chỉ đó; không bind trực tiếp website ra IP LAN A.
