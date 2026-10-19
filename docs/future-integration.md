# Ranh giới tích hợp giai đoạn sau

Hiện tại chỉ có frontend với dữ liệu mẫu. Máy chủ `tools/serve.mjs` phục vụ file để dùng ES Modules; không có API hay xác thực.

## Adapter Backend

Các trang gọi `api` trong `frontend/assets/js/core/data-source.js` qua phương thức async. Thay phần nội bộ module bằng HTTP client khi có Backend, giữ model hoặc viết bước chuyển đổi payload rõ ràng. Các nhóm nghiệp vụ hiện có: thông báo công khai/thống kê, người dùng hiện tại, phòng ban, dự án được phân công, việc được phân công, thông báo cá nhân và quản trị người dùng.

Không có endpoint giả đang được gọi. Tên URL, pagination, lỗi nghiệp vụ và schema phản hồi phải được thống nhất cùng Backend sau. Khi tích hợp, bổ sung loading/error state phù hợp cho mạng thật; các trạng thái hiện tại được tối ưu cho mock local tức thời. Loại bỏ adapter mẫu khỏi bản production thay vì đóng gói toàn bộ dữ liệu mẫu vào client.

## Xác thực và phân quyền

Login gửi username/password qua HTTPS tới Backend, không lưu mật khẩu vào browser storage. Backend cấp phiên an toàn, ưu tiên cookie HttpOnly/Secure/SameSite phù hợp mô hình triển khai. Xử lý hết hạn phiên, đăng xuất, rate limit, CSRF và xác thực input ở server theo thiết kế cuối cùng.

Role khác Department và khác ProjectMembership. Ví dụ Minh và Linh cùng IT nhưng chỉ Minh trong Alpha, Linh trong Beta. Máy chủ phải kiểm tra identity, role, department, membership và TaskAssignee trên từng thao tác; không tin ID/role client gửi lên. ADMIN có quyền rộng theo chính sách máy chủ được duyệt. Thu hồi/disable tài khoản cần thu hồi phiên thật và audit log. `demo-session.js` và các kiểm tra hiển thị hiện tại không đáp ứng những yêu cầu bảo mật này.

Home/Bản tin chung không yêu cầu đăng nhập ứng dụng. Department/Work/Admin phải được bảo vệ tại API. Frontend công khai được truy cập qua mạng được cho phép; VPN không thay thế định danh ứng dụng.

## Database

Dự kiến có Role, Department, User, Project, ProjectMembership, Task, TaskAssignee, Announcement và Notification. Dùng khóa ngoại, validation, migration và giao dịch theo Backend đã chọn. Không đồng nhất quyền với phòng ban hoặc tự cấp assignment theo department. Quy trình lưu số liệu public cần được định nghĩa thay cho KPI minh họa. Chưa tạo schema, migration hoặc kết nối Database.

## Hạ tầng dự kiến

```text
backend/                 # API, authentication, authorization
database/                # Schema/migrations khi thiết kế được duyệt
nginx/                   # Reverse proxy / load-balancing
docker-compose.yml       # Orchestration cho demo sau
.env.example             # Tên cấu hình, không chứa bí mật
```

Các đường dẫn này là kế hoạch; chưa có file hoặc thư mục rỗng tương ứng được tạo.

Nginx phục vụ frontend cục bộ và proxy API. Nếu dùng nhiều instance Backend, cần lưu phiên/thông tin dùng chung phù hợp, health checks và chính sách cân bằng tải. Docker Desktop đóng gói các dịch vụ sau khi chốt công nghệ, có volume và cấu hình môi trường; secrets không được đưa vào frontend hoặc Git.

Mini VPN giới hạn truy cập ở tầng mạng cho máy trong LAN/thiết bị được cấp quyền. Thử nghiệm route, DNS, TLS và firewall trong giai đoạn hạ tầng. Quyền truy cập mạng chỉ cho phép đến dịch vụ, không tự cấp quyền xem công việc người khác.

## Lộ trình

1. Duyệt tài nguyên và nội dung doanh nghiệp thật.
2. Thống nhất hợp đồng API và mô hình phân quyền/assignment.
3. Triển khai Backend + Database và kiểm thử quyền ở server.
4. Thay adapter mock, tích hợp form login và các trạng thái mạng.
5. Đóng gói Docker/Nginx, cấu hình LAN/Mini VPN và kiểm thử đầy đủ.
