# Docker cho backend website và Nginx standalone

Bản ghép dùng gateway .NET ở cổng loopback 18080. Docker mặc định chạy DB, migration và API nghiệp vụ; xem [hướng dẫn tích hợp](integrated-deployment.md) để chạy cả VPN/website.

## Backend mặc định

Tại thư mục webnew, chuẩn bị .env từ .env.example và đặt mật khẩu DB riêng, không chép đè .env đang dùng:

```powershell
docker compose up -d --build
docker compose exec -it api npm run set-password -- hoangan
```

API publish `127.0.0.1:13000 → api:3000`; DB chỉ ở mạng Docker. API container bind 0.0.0.0 bên trong container, không mở trực tiếp ra LAN. Gateway proxy cùng origin nên browser không cần biết cổng 13000. Giữ COOKIE_SECURE=true khi gateway chạy HTTPS.

Migrator chạy dưới postgres; API chạy bằng anviet_app. Migrations có transaction, advisory lock và checksum trong schema_migrations; không sửa file đã áp dụng. Bổ sung schema bằng file mới. Migration 070 thêm auth_version cho users/auth_sessions để chặn race đăng nhập/thu hồi. Các DB cũ tương thích bằng epoch 0.

```powershell
docker compose logs -f api
docker compose ps
```

Sao lưu trước khi deploy migration mới. Dữ liệu postgres_data tồn tại qua restart/down; không dùng down -v trên database cần giữ.

## Nginx standalone

Chỉ bật khi xem riêng website nghiệp vụ mà không đi qua gateway:

```powershell
docker compose --profile standalone up -d --build web
```

Mở `https://127.0.0.1:18443/`; không tranh cổng 18080. Nginx tự tạo certificate lab trong tls_certs với SAN localhost/127.0.0.1/TLS_HOSTNAME. Cần đối chiếu và tin cậy public certificate hoặc dùng CA phù hợp. Private key không đưa vào frontend hoặc Git.

Profile này không proxy control API VPN: /api/vpn/* trả 503 gateway_required. Dùng gateway .NET để quản trị VPN, không mở control API trên host cho container/LAN.

## Mật khẩu và session

Tài khoản seed không có mật khẩu mặc định. CLI set-password nhập ẩn, không nhận password qua tham số; cập nhật password hash scrypt, tăng auth_version, thu hồi session và ghi audit cùng transaction. Website hỗ trợ tự đổi mật khẩu sau khi xác nhận mật khẩu hiện tại.

Cookie phiên HttpOnly, SameSite=Lax, Secure khi COOKIE_SECURE=true, hết hạn sau 8 giờ. Thao tác thay đổi yêu cầu Origin khớp host/scheme public; gateway ghi đè Host/X-Forwarded-Proto bằng thông tin request thực tế, không tin header role từ browser. Role ADMIN thật được gateway xác minh để cấp quyền VPN.

## Backup và restore

Trong Linux/WSL/Git Bash tại webnew:

```sh
bash tools/backup-db.sh
bash tools/restore-db.sh backups/anviet_<timestamp>.dump
```

Backup mặc định nằm trong backups/ với checksum SHA-256 và chứa dữ liệu người dùng/password hash; hạn chế ACL và lưu bản sao riêng. Restore script kiểm tra archive và thử trên DB tạm, thu hồi session, yêu cầu xác nhận RESTORE anviet rồi mới chuyển database. DB cũ được giữ dưới tên anviet_before_restore_<timestamp>. Cần đủ dung lượng cho các bản DB; không chạy nhiều backup/restore đồng thời.

Các phép kiểm thử merge sử dụng container riêng, không chạy restore trên database thật. Việc xác nhận backup/restore với dữ liệu vận hành và chính sách lưu trữ vẫn thuộc checklist vận hành.
