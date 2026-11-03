# PBL4 — MiniVPN và cổng thông tin An Việt

Dự án gồm MiniVPN .NET/Wintun trên Windows và website An Việt có backend Node.js/PostgreSQL. Mã website đã hợp nhất trong `webnew/`; frontend được copy/publish bởi `MiniVpn.InternalWeb`.

- VPN: TLS/TCP trên IP LAN máy A (thường cổng 42424), pin fingerprint SHA256.
- Mạng VPN: server `10.8.0.1`, client `10.8.0.2–254`, route tới server `10.8.0.1/32`.
- Web relay: `10.8.0.1:8080 → 127.0.0.1:18080`.
- Gateway .NET: phục vụ FE và `/api/vpn/*`; API nghiệp vụ chuyển tới Node.js trên `127.0.0.1:13000`.
- Control API VPN: trong chính process server, chỉ loopback `18181`, có service token.
- ADMIN thật của website được cấp quyền quản trị VPN; EMPLOYEE và Development Preview không có quyền này.
- Tài khoản VPN trong `accounts.json` tách biệt với tài khoản website trong PostgreSQL.

## Chạy hệ thống

Làm theo [hướng dẫn tích hợp](webnew/docs/integrated-deployment.md) để khởi động theo thứ tự: PostgreSQL/migration/API → VPN server → gateway website → watchdog.

```powershell
dotnet build .\MiniVpn.sln -c Release
# Sau khi cấu hình backend, HTTPS và secret theo hướng dẫn:
dotnet run --project .\src\MiniVpn.InternalWeb -c Release
```

Website trên A: `https://127.0.0.1:18080/`. Client sau khi kết nối VPN: `https://10.8.0.1:8080/`. Đăng nhập website bằng ADMIN, mở menu tài khoản → Quản trị VPN hoặc `/vpn-admin.html`. HTTP chỉ dùng với cấu hình Development rõ ràng trong hướng dẫn.

Client Windows:

Để phát hành cho laptop client chỉ với một EXE, chạy `scripts/Publish-Client.ps1`. Bản self-contained kèm .NET/Wintun, yêu cầu Administrator và có thể tự mở website sau khi kết nối. Xem [đóng gói và sử dụng EXE](docs/07-client-exe.md).

Để phát hành cho laptop client chỉ với một EXE, chạy `scripts/Publish-Client.ps1`. Bản self-contained kèm .NET/Wintun, yêu cầu Administrator và có thể tự mở website sau khi kết nối. Xem [đóng gói và sử dụng EXE](docs/07-client-exe.md).

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Run-Desktop.ps1
```

## Tài liệu

- [Khảo sát và kiến trúc](docs/01-preflight-and-architecture.md)
- [Build, Wintun, route và kiểm thử hai laptop](docs/02-vpn-checkpoint.md)
- [VPN Client Windows](docs/03-desktop-ui.md)
- [Phát hành client một file EXE](docs/07-client-exe.md)
- [Phát hành client một file EXE](docs/07-client-exe.md)
- [Kiểm chứng web chỉ qua VPN](docs/04-internal-web-demo.md)
- [Tài khoản, thu hồi phiên, log, cảnh báo và watchdog](docs/05-vpn-administration.md)
- [API VPN và xác thực dùng chung](docs/06-vpn-api.md)
- [FE/BE website](webnew/README.md)
- [Khởi động bản ghép](webnew/docs/integrated-deployment.md)

## Kiểm thử và giới hạn

```powershell
dotnet run --project .\tests\MiniVpn.Smoke -c Release
dotnet run --project .\tests\MiniVpn.Management.Tests -c Release
Push-Location .\webnew
npm.cmd run check
npm.cmd test
Pop-Location
```

Bật `MINIVPN_FULL_STACK_TEST=1` và `MINIVPN_BROWSER_TEST=1` để kiểm thử thêm Node/PostgreSQL thật trong container tạm cùng Chrome qua HTTPS. Xem điều kiện và phạm vi tại [hướng dẫn tích hợp](webnew/docs/integrated-deployment.md).

Các test tự động không thay kiểm chứng Wintun, firewall, route và truy cập HTTP trước/sau VPN trên hai laptop có Administrator. Dự án hiện dành cho LAN demo; chưa có nghiệm thu truy cập từ Internet/NAT.

Không đưa accounts.json, PFX/private key, mật khẩu, service token, .env, database dump hoặc wintun.dll lên Git. Cấu hình mẫu tại `config/vpn-management.example.json` không chứa secret.
