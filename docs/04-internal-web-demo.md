# Kiểm chứng website chỉ truy cập qua MiniVPN

Website hợp nhất dùng `webnew/frontend` và backend Node.js/PostgreSQL, qua gateway `MiniVpn.InternalWeb` ở `127.0.0.1:18080`. MiniVPN chuyển tiếp TCP từ `10.8.0.1:8080` tới gateway. Xem [thứ tự khởi động, HTTPS và đăng nhập](../webnew/docs/integrated-deployment.md) trước khi làm các phép thử dưới đây.

## Laptop A

Chạy backend, VPN server và gateway theo hướng dẫn. A có thể mở `https://127.0.0.1:18080/` trực tiếp mà không cần VPN. Web không bind IP LAN; Node chỉ publish loopback và PostgreSQL không publish ra LAN.

Giữ các rule firewall chỉ trên đúng adapter VPN và nguồn đã cấp quyền:

```powershell
New-NetFirewallRule -DisplayName 'MiniVPN web over tunnel' -Direction Inbound -Action Allow -Profile Any -Protocol TCP -InterfaceAlias 'MiniVpn-Server' -LocalAddress '10.8.0.1' -RemoteAddress '10.8.0.0/24' -LocalPort 8080
```

Nếu rule đã có thì không tạo lại. Cổng TLS VPN trên IP LAN chỉ mở cho các client được chỉ định; xem [hướng dẫn mạng](02-vpn-checkpoint.md). Không mở cổng 18080, 13000, 18181 hoặc PostgreSQL ra LAN.

## Laptop B/C: trước khi kết nối

Thay IP LAN A trong ví dụ bằng IP thật:

```powershell
curl.exe --noproxy "*" --connect-timeout 5 https://192.168.1.10:18080/
curl.exe --noproxy "*" --connect-timeout 5 https://192.168.1.10:8080/
curl.exe --noproxy "*" --connect-timeout 5 https://10.8.0.1:8080/
```

Không được nhận nội dung An Việt từ ba địa chỉ đó. Kiểm tra xung đột subnet VPN nếu LAN đã dùng 10.8.0.0/24.

## Laptop B: có VPN và sau khi ngắt

Chạy client Windows bằng Administrator, đối chiếu fingerprint VPN qua kênh tin cậy và đăng nhập. Khi được cấp IP, mở `https://10.8.0.1:8080/`. Tin cậy chứng chỉ HTTPS website theo hướng dẫn; không tắt kiểm tra TLS.

Kiểm tra trang chủ, assets, đăng nhập website, công việc/phòng ban và dashboard VPN bằng ADMIN thật. EMPLOYEE không được gọi API VPN; ADMIN mẫu trong `?demo=1` không cấp quyền thật.

```powershell
curl.exe --noproxy "*" --connect-timeout 5 https://10.8.0.1:8080/
```

Ngắt VPN và thử lại; không được tải nội dung mới. Trang đã tải có thể vẫn còn trong bộ nhớ trình duyệt, vì vậy dùng HTTP request mới để kiểm chứng. Test-NetConnection chỉ chứng minh bắt tay TCP, chưa chứng minh website trả được nội dung.

| Trạng thái | IP LAN A:18080/8080 | 10.8.0.1:8080 |
| --- | --- | --- |
| B/C chưa có VPN | Không truy cập được web | Không tải được |
| B có VPN | Không truy cập được web trực tiếp | Tải được An Việt |
| B ngắt VPN | Không truy cập được web | Không tải nội dung mới |

Thử B và C cùng kết nối, IP khác nhau; ngắt/khóa phiên B từ A phải đóng cả tunnel/relay B và giữ C hoạt động. Reset mật khẩu VPN cũng thu hồi mọi phiên tương ứng. HTTP demo chỉ thực hiện theo cấu hình Development rõ ràng; đổi các URL sang http tương ứng trong kịch bản đó.
