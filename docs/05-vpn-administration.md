# Quản trị tài khoản, phiên, log và giám sát MiniVPN

## Kiến trúc

FE website và dashboard VPN nằm trong `webnew/frontend`. Gateway `MiniVpn.InternalWeb` phục vụ cùng origin trên loopback 18080, proxy API nghiệp vụ tới Node.js/PostgreSQL và API VPN tới control API loopback 18181 trong chính process MiniVPN server.

ADMIN thật của website được xác minh qua GET /api/me ở backend Node trên mỗi request VPN. EMPLOYEE bị từ chối; khóa, đổi role, reset mật khẩu hoặc hết hạn phiên website làm mất quyền VPN ở request tiếp theo. Browser role/query/sessionStorage không cấp quyền. Dashboard dùng adapter `webnew/frontend/assets/js/services/vpn-api.js`, độc lập với adapter nghiệp vụ.

Dịch vụ và interface ở `MiniVpn.Management`: IVpnAccountStore, IVpnSessionManager, IVpnAuditStore, ISystemMetricsProvider, IAlertNotifier. Runtime tunnel/relay ở MiniVpn.Server/Runtime. Không có nút restart hoặc lệnh shell do web nhận từ người dùng.

## Khởi động và đăng nhập

Làm theo [hướng dẫn tích hợp](../webnew/docs/integrated-deployment.md) cho DB/API, chứng chỉ HTTPS, service token, server và gateway. Nạp cùng MINIVPN_CONFIG tuyệt đối và MINIVPN_CONTROL_TOKEN ngẫu nhiên ít nhất 32 ký tự vào terminal Server/Web/Watchdog.

Mặc định VpnAdmin.AuthenticationMode=Portal và TemporaryLoginEnabled=false. Đăng nhập website bằng ADMIN, mở /vpn-admin.html. Không cần MINIVPN_ADMIN_PASSWORD trong chế độ Portal. Tài khoản VPN và website độc lập, không tự đồng bộ.

Chế độ Temporary chỉ để tương thích/khôi phục có kiểm soát: phải đặt AuthenticationMode=Temporary, TemporaryLoginEnabled=true và cung cấp MINIVPN_ADMIN_PASSWORD (12–256 ký tự, không có mặc định), MINIVPN_ADMIN_USERNAME tùy chọn (mặc định vpn-admin). Cookie HttpOnly/SameSite=Strict, thời hạn 30 phút, logout thu hồi tại server; restart web làm hết hạn phiên tạm. Không bật đồng thời temporary login ở Portal mode.

Production yêu cầu HTTPS. HTTP chỉ dùng với ASPNETCORE_ENVIRONMENT=Development và AllowInsecureHttpDevelopment=true, cấu hình Node COOKIE_SECURE=false đồng bộ khi demo. Không tự hạ bảo mật ở production. Mọi thao tác VPN thay đổi cần X-CSRF-Token và cookie antiforgery.

## Kho tài khoản VPN

Kho cũ dạng dictionary PasswordRecord được kiểm tra toàn bộ trước migration. Bản nguyên byte được lưu thành accounts.json.legacy-<UTC>.bak; file mới có schemaVersion=1 và danh sách account metadata. Giữ nguyên PBKDF2-SHA256, salt/hash/iterations. Thời điểm tạo/cập nhật của account cũ là thời điểm migration vì định dạng cũ không có metadata. Schema không hỗ trợ bị từ chối và không ghi đè.

Owner giữ accounts.json.lock bằng OS lock suốt vòng đời. Ghi bằng temp cùng thư mục, flush và atomic replace; bộ nhớ chỉ cập nhật sau khi ghi thành công. Không sửa JSON trực tiếp khi server chạy. Bảo vệ ACL cho account file, lock, backup và thư mục state; backup chứa hash/salt nhạy cảm.

Username VPN 1–32 ASCII letters/digits/underscore, phân biệt hoa/thường; password 12–256 ký tự. Notes/externalUserId tùy chọn, không tự gộp danh tính website với VPN.

CLI tại gốc repository:

```powershell
dotnet run --project .\src\MiniVpn.Server -c Release -- add-user .\accounts.json alice
dotnet run --project .\src\MiniVpn.Server -c Release -- list-users .\accounts.json
dotnet run --project .\src\MiniVpn.Server -c Release -- disable-user .\accounts.json alice
dotnet run --project .\src\MiniVpn.Server -c Release -- enable-user .\accounts.json alice
dotnet run --project .\src\MiniVpn.Server -c Release -- reset-password .\accounts.json alice
dotnet run --project .\src\MiniVpn.Server -c Release -- disconnect-user .\accounts.json alice
dotnet run --project .\src\MiniVpn.Server -c Release -- delete-user .\accounts.json alice
```

Password nhập ẩn. add-user tạo mới, hoặc reset mật khẩu và thu hồi phiên nếu account đã tồn tại; giữ trạng thái khóa hiện có. CLI có token sẽ xác nhận store ID rồi gọi runtime API. Chỉ offline khi kết nối bị từ chối và lấy được OS lock; lỗi auth/timeout/khác store không fallback ghi offline. Thiếu token khi server giữ store phải bị từ chối, không ghi đè snapshot cũ.

Disable/delete/reset password đóng mọi tunnel và relay của user. Enable không tự kết nối lại. Disconnect không khóa account, người dùng có thể đăng nhập lại. Luồng login/đăng ký session dùng cùng gate với thay đổi account để chặn race. IP chỉ trả pool sau khi task tunnel kết thúc; có thể thấy trạng thái Đang đóng trong thời gian dọn tài nguyên. Ngắt một session không đóng các session khác.

## Audit và cảnh báo

JSON Lines UTC ở <StateDirectory>/audit/yyyy-MM-dd.jsonl; trạng thái gửi cảnh báo ở alerts/yyyy-MM-dd.jsonl. Dashboard hiển thị giờ địa phương của browser. Retention mặc định 30 ngày, query mặc định 24 giờ/tối đa 31 ngày và 100 dòng/trang. Không nhận đường dẫn file từ web. Không cho sửa/xóa log thủ công trên dashboard.

Ghi login success/failure, connect/disconnect/reason, account actions, admin revoke, service errors, alert và watchdog. Actor VPN lấy từ immutable user ID đã được Node xác thực trong Portal mode. Không log request body, password/hash/salt, PFX password, token/cookie, webhook URL hoặc provider response. Input được chuẩn hóa/giới hạn. Kho audit không ghi được báo stderr/auditHealthy=false; thu hồi tunnel vẫn tiếp tục.

Provider mặc định tắt. Đặt secret ở server/watchdog:

- MINIVPN_DISCORD_WEBHOOK: HTTPS webhook Discord.
- MINIVPN_TELEGRAM_TOKEN và MINIVPN_TELEGRAM_CHAT_ID: Telegram, dùng khi không có Discord.

Queue tối đa 256, cooldown mặc định 300 giây theo loại/IP, timeout, tối đa 3 lần gửi với backoff 1/2 giây. Lỗi notifier không dừng VPN. Lịch sử phân biệt sent/failed/disabled và số lần thử, không lộ secret.

VPN login giới hạn 6 lần sai/5 phút theo IP nguồn TLS. Website dùng limiter Node 5 lần sai/15 phút theo username. Temporary login có limiter riêng 5 lần/5 phút theo địa chỉ gateway; các client qua relay có thể chia sẻ địa chỉ loopback tại gateway.

## Metrics và watchdog

Lấy mẫu mặc định 10 giây, cảnh báo ngưỡng CPU/RAM/disk phải kéo dài 60 giây. CPU là process VPN / số CPU logic khả dụng, RAM process là working set; RAM hệ thống dùng GlobalMemoryStatusEx; disk là volume chứa state. Đơn vị byte/giây, CPU %. Lưu lượng là byte IP payload hợp lệ nhận/gửi thành công, không gồm TLS/TCP overhead. Không lấy được thì trả null, UI hiển thị Không khả dụng. CPU mẫu đầu chưa khả dụng.

Website health kiểm tra /healthz trên gateway; ở Portal mode health bao gồm backend Node/DB. HTTPS health cần certificate được hệ điều hành tin cậy. Dashboard poll 10 giây khi tab hiển thị, hủy request/timer khi rời trang và đánh dấu dữ liệu cũ/offline khi lỗi.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Run-VpnWatchdog.ps1
```

Watchdog chạy riêng, kiểm tra control health/heartbeat; sau mặc định 3 lần lỗi liên tiếp phát cảnh báo. status.json stopped biểu thị dừng sạch; crash để lại running hoặc faulted. Sai token/config cũng có thể trông như mất phản hồi, cần kiểm tra tại server. Để chạy lâu dài có thể dùng Task Scheduler với tài khoản dịch vụ và secret ngoài Git, không gắn vòng đời watchdog với terminal VPN.

Nếu cả laptop A tắt, watchdog trên A cũng dừng; phát hiện mất cả máy cần hệ giám sát ngoài máy, ngoài phạm vi loopback hiện tại.

## Phục hồi và kiểm chứng

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Recover-VpnServer.ps1 -LanAddress 192.168.1.10
```

Chạy tại A bằng Administrator, thay IP thật, nạp config/token/PFX password. Script từ chối nếu cổng VPN còn listener; chỉ dọn địa chỉ 10.8.0.1 trên đúng adapter MiniVpn-Server rồi chạy server. Không kill process/xóa adapter khác hoặc cung cấp restart qua web.

Checklist manual:

- Trước VPN: B/C không tải được web qua IP LAN A hoặc 10.8.0.1:8080; A vẫn đọc được loopback.
- Có VPN: B tải website/assets; ADMIN thật quản trị VPN, EMPLOYEE/preview không được phép.
- Hai client: IP khác nhau, cùng sống; ngắt/khóa B đóng tunnel/relay B và giữ C.
- Reset/delete VPN account: mọi phiên tương ứng đóng, mật khẩu cũ không đăng nhập được.
- Ngắt VPN: route/IP client được dọn, HTTP request mới không tải được web.
- Dừng web/Node/DB: health/offline đúng; không dùng lại role ADMIN cũ khi backend mất kết nối.
- Dừng VPN sạch: watchdog thấy intentional-stop; kill đột ngột: watchdog riêng cảnh báo và script phục hồi dùng tại A.
- Cấu hình provider sai: lịch sử gửi failed, VPN vẫn chạy.

Xem [hướng dẫn test](../webnew/docs/integrated-deployment.md) cho bộ test riêng. Test dùng TLS/TCP thật, backend/DB thật và Chrome, thay packet device Wintun và listener địa chỉ relay bằng test doubles; không thay kiểm chứng Administrator/Wintun trên hai laptop.
