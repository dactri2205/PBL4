# PBL4 — Mini VPN

## 1. Giới thiệu

Mini VPN PBL4 — VPN và cổng thông tin nội bộ An Việt chạy trên laptop A.

Mã nguồn hiện có:

- **Backend:** Server/Client .NET 10.
- **Giao diện:** Windows Forms cho VPN Client.
- **Website nội bộ:** `MiniVpn.InternalWeb` phục vụ website An Việt trong `web/frontend`, chỉ lắng nghe tại `127.0.0.1:18080` trên A. Tài nguyên được sao chép vào `wwwroot` khi build/publish; không cần chạy thêm Node.js.
- **Bảo mật:** `SslStream`, PBKDF2.
- **Mạng:** Giao thức khung, cấp IP phiên, Wintun, route và TCP relay tại `10.8.0.1:8080`.

**Trạng thái:** Đã tích hợp frontend An Việt để truy cập qua VPN; dữ liệu và phiên xem thử vẫn là dữ liệu mẫu phía trình duyệt, chưa có API đăng nhập, database hoặc Docker Compose.

> **Lưu ý:** Chưa ghi nhận trong repository kết quả kiểm tra HTTP trước/sau VPN trên hai laptop thật; cần hoàn thành phép thử này trước khi nghiệm thu.

## 2. Chạy demo website qua VPN

Trên laptop A, chạy website trong một PowerShell:

```powershell
dotnet run --project .\src\MiniVpn.InternalWeb\MiniVpn.InternalWeb.csproj -c Release
```

Trong PowerShell Administrator khác trên A, chạy MiniVPN server theo [hướng dẫn demo web](docs/04-internal-web-demo.md). Website chỉ mở trực tiếp trên A tại `http://127.0.0.1:18080`; client VPN mở qua `http://10.8.0.1:8080`. Trang chủ là An Việt; thêm `?demo=1` để chọn người dùng mẫu và xem các trang phòng ban, công việc, quản trị. Chi tiết frontend tại [web/README.md](web/README.md).

## 3. Cách chạy VPN Client

Để mở cửa sổ client và xem lỗi khởi động nếu có, chạy lệnh PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Run-Desktop.ps1
```

## 4. Tài liệu hướng dẫn

- [Hướng dẫn giao diện](docs/03-desktop-ui.md)
- [Khảo sát và kiến trúc](docs/01-preflight-and-architecture.md)
- [Biên dịch và thử VPN](docs/02-vpn-checkpoint.md)
- [Demo website chỉ truy cập qua VPN](docs/04-internal-web-demo.md)

Sau khi kiểm thử HTTP trước/sau VPN trên hai máy thành công, có thể tích hợp API xác thực, database và Docker cho frontend hiện có.

## 5. Trạng thái kiểm thử và lưu ý

- Windows Application Control từng chặn các assembly mới biên dịch với mã lỗi `0x800711C7`.
- Trạng thái chính sách đã thay đổi và bộ smoke test hiện chạy thành công **8/8**.
- Sử dụng `scripts/Run-Desktop.ps1` để quan sát lỗi nếu chính sách chặn trở lại.
- Đường hầm Wintun vẫn cần được kiểm thử bằng PowerShell với quyền **Administrator trên cả hai laptop**.

## 6. Bảo mật

Không đưa các tệp hoặc thông tin nhạy cảm sau lên Git:

- Chứng chỉ PFX.
- Mật khẩu.
- `accounts.json`.
- `wintun.dll`.

Đây là sản phẩm học tập, chỉ sử dụng trong môi trường **LAN demo**.
