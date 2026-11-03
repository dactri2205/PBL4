# Ranh giới tích hợp giai đoạn sau

## Hiện trạng

Dự án có Node.js API, PostgreSQL và Nginx trong Docker Compose. API có health, bản tin, thống kê, danh bạ, xác thực, API phòng ban/dự án/công việc, thông báo cá nhân và quản trị người dùng có session. Các trang dùng API khi preview không bật. Preview `?demo=1` tiếp tục dùng mock data. Máy chủ `tools/serve.mjs` chỉ phục vụ frontend và không proxy API.

## Adapter Backend

Các trang gọi `api` trong `frontend/assets/js/core/data-source.js` qua phương thức async. Adapter bản tin, thống kê, danh bạ, phòng ban, dự án, công việc, thông báo, quản trị người dùng và đổi mật khẩu gọi API khi không ở preview.

Hợp đồng bản tin trả `{ data: [...] }`; thống kê trả `{ data: { members, departments } }`; danh bạ trả `{ data: { members, departments } }` với projection hồ sơ công khai. Chế độ `?demo=1` chỉ phục vụ xem thử; website mặc định dùng API thật.

## Xác thực và phân quyền

Đã có `POST /api/auth/login`, `POST /api/auth/logout` và `GET /api/me`. Password hash dùng Node scrypt; phiên ngẫu nhiên được lưu dưới dạng SHA-256 verifier trong PostgreSQL, cookie HttpOnly/SameSite=Lax hết hạn sau 8 giờ. Login có giới hạn 5 lần sai mỗi username trong 15 phút. Mọi endpoint thay đổi dữ liệu yêu cầu Origin khớp chính xác scheme và host hiện tại; request thiếu Origin hoặc khác origin bị từ chối. Đặt mật khẩu tài khoản bằng CLI tương tác, không có mật khẩu mẫu.

Compose publish HTTPS trên loopback `127.0.0.1:18080`; Mini VPN relay chuyển tiếp qua `10.8.0.1:8080`. TLS website lab dùng certificate tự ký và `COOKIE_SECURE=true`. API Work lấy identity từ session server-side; nhân viên chỉ xem dự án là thành viên và công việc được giao; ADMIN có quyền xem rộng tại server. API phòng ban, thông báo và quản trị cũng kiểm tra session/quyền ở backend. Vô hiệu hóa tài khoản thu hồi session; đổi mật khẩu yêu cầu mật khẩu hiện tại và thu hồi các session cũ. Audit log ghi cùng transaction cho các thay đổi quản trị, trạng thái công việc và mật khẩu, không lưu mật khẩu. Việc còn lại là kiểm tra các luồng quyền bằng tài khoản thật và xác nhận sao lưu database.

Role khác Department và khác ProjectMembership. Ví dụ Minh và Linh cùng IT nhưng chỉ Minh trong Alpha, Linh trong Beta. Máy chủ phải kiểm tra identity, role, department, membership và TaskAssignee trên từng thao tác; không tin ID/role client gửi lên. ADMIN có quyền rộng theo chính sách máy chủ được duyệt. Thu hồi/disable tài khoản cần thu hồi phiên thật và audit log. `demo-session.js` và các kiểm tra hiển thị hiện tại không đáp ứng những yêu cầu bảo mật này.

Home/Bản tin chung không yêu cầu đăng nhập ứng dụng. Department/Work/Admin phải được bảo vệ tại API. Frontend công khai được truy cập qua mạng được cho phép; VPN không thay thế định danh ứng dụng.

## Database

Schema PostgreSQL hiện có Department, User, DirectoryProfile, Project, ProjectMember, Task, TaskAssignee, Announcement và Notification. `database/migrate.js` áp dụng migration theo thứ tự, ghi checksum vào `schema_migrations`, khóa để ngăn hai runner cùng chạy và từ chối sửa migration đã áp dụng. Migration `030_public_directory_job.sql` tách chức danh công khai khỏi chức danh tài khoản. Không đồng nhất quyền với phòng ban hoặc tự cấp assignment theo department. Quy trình lưu số liệu public cần được định nghĩa thay cho KPI minh họa.

## Hạ tầng đang chạy

```text
backend/                 # Node.js API cho auth, directory, work, notifications, admin
database/                # PostgreSQL schema migrations and migrator
nginx/                   # Phục vụ frontend và reverse proxy API
docker-compose.yml       # web, api, db
.env.example             # Mẫu biến cấu hình, không chứa secret thật
```

Nếu dùng nhiều instance Backend, cần lưu phiên/thông tin dùng chung phù hợp, health checks và chính sách cân bằng tải. Secrets không được đưa vào frontend hoặc Git.

Mini VPN giới hạn truy cập ở tầng mạng cho máy trong LAN/thiết bị được cấp quyền. Thử nghiệm route, DNS, TLS và firewall trong giai đoạn hạ tầng. Quyền truy cập mạng chỉ cho phép đến dịch vụ, không tự cấp quyền xem công việc người khác.

## Việc còn lại trong phạm vi đề tài

1. Kiểm tra quyền và các luồng API bằng tài khoản ADMIN/EMPLOYEE trên stack Docker.
2. Tạo bản backup database và xác nhận cách khôi phục trên bản sao an toàn.
