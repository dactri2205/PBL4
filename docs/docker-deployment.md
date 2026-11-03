# Chạy website và API bằng Docker Compose

Nginx phục vụ frontend, chuyển `/api/*` tới Node.js API; API kết nối PostgreSQL qua connection pool. Endpoint hiện có: public `GET /api/health`, `/api/announcements`, `/api/statistics`, `/api/directory`; xác thực `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/change-password`, `GET /api/me`; nghiệp vụ cần session `GET /api/department`, `GET /api/projects`, `GET /api/projects/:id/people`, `GET /api/tasks`, `GET /api/tasks/:id`, `GET /api/tasks/:id/people`, `PATCH /api/tasks/:id`, `GET /api/notifications`, `PATCH /api/notifications/:id`, `POST /api/notifications/read-all`, `GET /api/admin/departments`, `GET /api/admin/users`, `POST /api/admin/users` và `PATCH /api/admin/users/:id`.

Mọi request thay đổi dữ liệu phải gửi Origin khớp scheme và host của website; request thiếu Origin hoặc khác origin bị từ chối. Cookie session dùng `SameSite=Lax`.

Trang Work đọc dự án/công việc từ PostgreSQL. Nhân viên chỉ thấy dự án là thành viên và công việc được giao; ADMIN có thể xem toàn bộ. `PATCH /api/tasks/:id` chỉ cho người được giao hoặc ADMIN cập nhật một trong các trạng thái `Pending`, `In Progress`, `Completed`. Các endpoint riêng tư trả `401` khi thiếu phiên; tài nguyên không được phép truy cập trả `404` để tránh tiết lộ sự tồn tại.

Trang Phòng ban lấy phòng ban của tài khoản đang đăng nhập, danh sách thành viên đang hoạt động và các dự án thuộc phòng ban mà tài khoản được phép xem. Client không được chọn `departmentId` để truy vấn phòng ban khác.

Thông báo cá nhân chỉ lấy theo user từ session. Có thể đánh dấu một thông báo hoặc tất cả là đã đọc; API không hỗ trợ đánh dấu lại thành chưa đọc. Tài khoản không thể đọc hoặc cập nhật thông báo của người khác.

Audit log ghi lại người thao tác và thay đổi khi tạo/sửa tài khoản hoặc đổi trạng thái công việc. Log được ghi cùng transaction với thay đổi tương ứng, không lưu mật khẩu và không có endpoint công khai để đọc/sửa/xóa log.

API `/api/admin/*` chỉ cho ADMIN. Tài khoản mới được tạo chưa có password hash và chưa thể đăng nhập cho tới khi quản trị viên đặt mật khẩu bằng `docker compose exec -it api npm run set-password -- <username>`. Khi vô hiệu hóa tài khoản, các session hiện có bị thu hồi; API cũng ngăn vô hiệu hóa/hạ quyền tài khoản đang đăng nhập hoặc quản trị viên hoạt động cuối cùng.

## Chạy trên máy có Docker

Chạy Docker Desktop ở chế độ Linux containers trên chính máy Windows chạy VPN server. Tại thư mục gốc dự án, sao chép `.env.example` thành `.env`, đặt hai mật khẩu mạnh/riêng biệt. `WEB_LOCAL_PORT` mặc định là `18080`, còn `TLS_HOSTNAME` phải khớp địa chỉ dùng trên trình duyệt qua VPN (mặc định `10.8.0.1`). Không commit `.env`:

```sh
cp .env.example .env
# Đặt mật khẩu mạnh và chỉnh TLS_HOSTNAME nếu địa chỉ VPN khác 10.8.0.1
docker compose up -d --build
docker compose ps
```

Compose chỉ publish HTTPS của Nginx tại `127.0.0.1:${WEB_LOCAL_PORT}` trên máy VPN server; cổng HTTP 80 không được publish. Cấu hình VPN relay chuyển tiếp từ `10.8.0.1:8080` tới `127.0.0.1:18080`. Từ client đã kết nối VPN, mở `https://10.8.0.1:8080/`. Kiểm tra API/DB tại `https://10.8.0.1:8080/api/health`.

Nginx tạo chứng chỉ tự ký trong volume `tls_certs` (hiệu lực 365 ngày). Trình duyệt cảnh báo cho đến khi certificate được tin cậy. Để tin cậy trên Windows client, xuất certificate công khai rồi thêm vào Current User Trusted Root:

```powershell
docker compose cp web:/etc/nginx/certs/server.crt .\anviet-lab.crt
certutil -user -addstore Root .\anviet-lab.crt
```

Chỉ certificate công khai được xuất; private key ở Docker volume và bị loại khỏi Git. Client khác trong LAN cần nhận `anviet-lab.crt` qua kênh tin cậy rồi cài vào trust store của client đó.

`TLS_HOSTNAME` phải khớp địa chỉ host trên URL (không gồm cổng), ví dụ `10.8.0.1` cho `https://10.8.0.1:8080/`. Nếu đổi địa chỉ sau lần tạo certificate đầu tiên, cập nhật `.env` rồi tạo lại riêng TLS volume:

```powershell
docker compose stop web
docker volume rm web_pbl4_tls_certs
docker compose up -d web
```

Lệnh này không xóa volume database. Chứng chỉ tự ký phù hợp demo/lab; dùng certificate từ CA đáng tin cậy khi công khai dịch vụ.

Port `18080` chỉ bind loopback nên client LAN/Internet không kết nối trực tiếp được. Relay VPN là đường truy cập duy nhất; firewall Windows cần cho phép cổng listener VPN từ các máy được cấp quyền. Không mở cổng web, API `3000` hoặc PostgreSQL `5432` ra LAN/Internet. Nếu relay port hoặc VPN IP đổi, cập nhật `WEB_LOCAL_PORT`, `TLS_HOSTNAME` và cấu hình relay đồng bộ.

### Dùng certificate từ CA

Lấy certificate có SAN khớp chính xác với hostname người dùng sẽ mở và private key tương ứng. Với CA cấp chain, đặt full chain vào `server.crt`. Không đặt private key trong Git hoặc thư mục frontend. Sao chép từ vị trí bảo mật trên host vào volume TLS:

```powershell
docker compose cp "C:\secure\fullchain.pem" web:/etc/nginx/certs/server.crt
docker compose cp "C:\secure\privkey.pem" web:/etc/nginx/certs/server.key
docker compose exec -T web chmod 600 /etc/nginx/certs/server.key
docker compose restart web
```

`TLS_HOSTNAME` trong `.env` phải khớp SAN của certificate. Khi cập nhật certificate, thay cả chain và key rồi restart service `web`. Certificate lab tự ký sẽ tiếp tục được dùng nếu không thay hai file này trong volume.

## Vận hành cơ bản

```sh
docker compose logs -f
docker compose restart
docker compose down
```

### Sao lưu và khôi phục database

Trên Linux VM, WSL hoặc Git Bash tại thư mục dự án, tạo custom-format dump bằng PostgreSQL trong container:

```sh
bash tools/backup-db.sh
```

Mặc định bản sao lưu nằm trong `backups/` (đã loại khỏi Git) và có checksum SHA-256. File chứa dữ liệu người dùng và password hash; giữ ở nơi có quyền truy cập hạn chế và sao chép ra thiết bị lưu trữ riêng.

Khôi phục từ một bản sao lưu:

```sh
bash tools/restore-db.sh backups/anviet_<timestamp>.dump
```

Script kiểm tra archive, khôi phục vào database tạm trước, xóa session trong bản khôi phục để buộc đăng nhập lại, rồi yêu cầu nhập chính xác `RESTORE anviet` mới thay database đang chạy. API được dừng trong lúc chuyển database. Database cũ được giữ lại với tên `anviet_before_restore_<timestamp>` để có thể quay lại; chỉ xóa sau khi xác nhận website hoạt động và cần thu hồi dung lượng. Cần đủ dung lượng trống cho database hiện tại, database tạm và database được khôi phục cùng lúc. Không chạy hai lần backup/restore đồng thời.

Compose publish HTTPS trên `127.0.0.1:${WEB_LOCAL_PORT}` để VPN relay trên cùng máy chuyển tiếp tới website. HTTP redirect không được publish. API và Database chỉ được các service trong mạng Docker `portal` truy cập; không mở cổng API hoặc Database trực tiếp ra LAN/Internet. Database và TLS certificate lưu ở hai volume riêng; `restart: unless-stopped` giúp dịch vụ chạy lại sau khi Docker khởi động.

Service `migrate` đợi DB healthy, chạy các file `database/migrations/` theo thứ tự tên và ghi checksum/thời điểm vào `schema_migrations`. Migration được áp dụng trong transaction; sửa file đã chạy sẽ làm lần deploy thất bại để tránh lịch sử schema bị lệch. Khi thêm thay đổi, tạo file mới theo mẫu `NNN_ten_migration.sql`; không sửa migrations đã áp dụng. API dùng user `anviet_app`; migrator dùng `postgres` và chỉ chạy trong mạng Docker.

Nếu volume đã được khởi tạo bởi bản bootstrap trước đó, migrator nhận diện các bảng cũ và đăng ký `010_schema.sql`/`020_demo_data.sql` làm baseline mà không chạy seed lần nữa. Nếu phát hiện schema không khớp, migrator dừng để bảo toàn dữ liệu và cần kiểm tra thủ công.

Tài khoản mẫu không có mật khẩu mặc định. Sau khi chạy stack, đặt mật khẩu cho tài khoản quản trị bằng lệnh tương tác (mật khẩu không hiện trên màn hình):

```powershell
docker compose exec -it api npm run set-password -- hoangan
```

Lệnh yêu cầu mật khẩu tối thiểu 12 ký tự và cập nhật hash scrypt trong DB; không truyền mật khẩu qua tham số dòng lệnh. Tài khoản khác có thể được đặt mật khẩu bằng cùng lệnh. `COOKIE_SECURE=true` được bật mặc định trong Compose để cookie phiên chỉ gửi qua HTTPS. Session được lưu server-side, cookie HttpOnly/SameSite=Lax và hết hạn sau 8 giờ.

Người dùng đã đăng nhập có thể đổi mật khẩu từ menu tài khoản, cần nhập mật khẩu hiện tại và mật khẩu mới tối thiểu 12 ký tự. Khi đổi thành công, tất cả session bị thu hồi và người dùng đăng nhập lại. Quên mật khẩu hoặc cấp mật khẩu ban đầu được quản trị viên xử lý bằng lệnh `set-password` ở trên.

Để cập nhật mã nguồn, chạy lại `docker compose up -d --build`. Frontend được sao chép vào image Nginx khi build nên cần build lại sau khi sửa frontend. Sao lưu database trước khi triển khai migration mới.

Khi đưa lên VM, truy cập `https://<IP-máy-ảo>/` từ client sau khi cài certificate tin cậy. Certificate tự ký mã hóa kết nối nhưng không xác minh danh tính VM nếu client chưa tin cậy certificate.
