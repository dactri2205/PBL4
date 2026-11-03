# An Việt — Cổng thông tin nội bộ

Frontend tiếng Việt cho một doanh nghiệp hư cấu, xây từ thư mục trống theo hệ thiết kế Dark Cyan Gradient + Minimal Light UI. Gồm 6 trang hoạt động, dữ liệu mẫu tập trung và các tương tác thực tế trong phiên trình duyệt.

## Chạy cục bộ

Cần Node.js hiện đại, không cần cài dependency để chạy ứng dụng. Trong PowerShell tại thư mục gốc:

```powershell
node tools/serve.mjs
```

Mở **http://localhost:5500/?demo=1** nếu chỉ chạy máy chủ frontend này; `?demo=1` giữ dữ liệu mẫu cho trang chủ và bản tin. Để chạy website kết nối API/PostgreSQL, dùng Docker Compose theo [docs/docker-deployment.md](docs/docker-deployment.md). Dừng máy chủ bằng `Ctrl+C`. Có thể dùng `npm start` hoặc `npm.cmd start` trên Windows. Muốn đổi cổng: `$env:PORT=5501; node tools/serve.mjs`.

Nếu đã cài Python:

```powershell
py -m http.server 5500 --directory frontend --bind 127.0.0.1
```

Không mở HTML bằng `file://` vì ứng dụng sử dụng ES Modules. `tools/serve.mjs` chỉ là máy chủ file cho phát triển cục bộ, không phải Backend ứng dụng.

## Công nghệ

Frontend dùng HTML5, CSS3 Design Tokens, Vanilla JavaScript ES Modules và Bootstrap **5.3.3** cục bộ. Backend dùng Node.js, `pg` và PostgreSQL; Nginx phục vụ frontend/proxy API trong Docker Compose. Website không cần tải tài nguyên frontend từ Internet khi chạy.

## Các trang và chức năng

| Trang             | Chức năng                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`      | Hero chia đôi, gradient đen–teal–cyan, ảnh văn phòng, latest update pill, 3 KPI, giá trị tập thể                                                |
| `login.html`      | Đăng nhập qua API, hiện/ẩn mật khẩu và phản hồi lỗi; cần tài khoản được cấp và đặt mật khẩu |
| `news.html`       | Danh sách bản tin từ API, lọc chuyên mục, tìm kiếm, đọc bài qua `?article=n1`                                                                      |
| `department.html` | Bento phòng ban, mục tiêu chung, thành viên dạng carousel ảnh với tilt 3D, dự án đúng phân công                                                 |
| `work.html`       | Thẻ dự án, bảng việc với 6 cột, tìm kiếm/lọc, drawer và cập nhật trạng thái qua API khi đăng nhập thật (hoặc dữ liệu mẫu trong preview)          |
| `admin.html`      | Quản lý người dùng: tìm kiếm/lọc, xem/thêm/sửa, xác nhận đổi quyền, kích hoạt/vô hiệu hóa; API thật cho ADMIN, preview lưu trong phiên              |

Header dùng chung, icon + chữ và gạch dưới mục hiện tại, menu thu gọn trên tablet/mobile, profile dropdown và thông báo cá nhân có trạng thái đã đọc. Dialog hỗ trợ Escape, focus được giới hạn bởi native `<dialog>`, đóng trả focus về phần tử mở nếu còn tồn tại. Giảm chuyển động được tôn trọng.

## Development Preview

Ở trang chủ, có thể bấm KPI **Thành viên** hoặc **Phòng ban** ngay cả ở giao diện khách để xem profile giới thiệu công khai. Modal Thành viên mặc định có carousel lãnh đạo/trưởng phòng; tìm kiếm toàn đội ngũ (hỗ trợ không dấu) chuyển sang lưới thẻ gọn, xóa từ khóa trở lại carousel. Modal Phòng ban hiển thị lưới các phòng, chọn phòng để xem đội ngũ và quay lại. Đội ngũ tối đa 8 người dùng carousel, trên 8 người dùng lưới; kết quả tìm kiếm luôn dùng lưới. Dữ liệu ban đầu gồm **9 thành viên hoạt động** (6 tài khoản mẫu + 3 hồ sơ Ban điều hành) và **2 phòng ban**; KPI được tính từ dữ liệu thay cho số minh họa cũ. Profile Ban điều hành không phải tài khoản đăng nhập, và chức danh trưởng phòng độc lập với quyền ADMIN/EMPLOYEE.

Mở **http://localhost:5500/?demo=1** để hiện thanh chọn người dùng mẫu. Thanh này không xuất hiện trong giao diện mặc định. Chế độ được giữ trong `sessionStorage` của tab hiện tại để có thể di chuyển giữa các trang.

| Lựa chọn | Vai trò / phòng ban | Phân công                                        |
| -------- | ------------------- | ------------------------------------------------ |
| Khách    | Không có phiên      | Chỉ trang chủ và bản tin công khai               |
| Minh     | EMPLOYEE / IT       | Alpha, các việc `t1`–`t4`                        |
| Linh     | EMPLOYEE / IT       | Beta, các việc `t5`–`t6`                         |
| Hà       | EMPLOYEE / Nhân sự  | Hành trình hội nhập, việc `t7`; thông báo rỗng   |
| Mai      | EMPLOYEE / IT       | Alpha; không có công việc được giao              |
| An       | ADMIN / IT          | Xem toàn bộ dự án/việc và quản lý người dùng mẫu |

Preview không có mật khẩu mẫu; đăng nhập thật dùng tài khoản PostgreSQL đã được đặt mật khẩu bởi quản trị viên. Trong preview, form đăng nhập không gửi thông tin và yêu cầu thoát preview trước. Đổi trạng thái công việc, thông báo, người dùng trong preview chỉ lưu trong phiên; không thay đổi máy chủ.

Chọn **Thoát xem thử** để trở về giao diện bình thường. Dữ liệu chỉnh sửa vẫn nằm trong `sessionStorage` của tab và được dùng lại nếu bật preview; đóng tab sẽ kết thúc phiên lưu của trình duyệt. Quản trị có nút **Khôi phục dữ liệu mẫu** để xóa các chỉnh sửa ngay. Việc đổi phòng ban không tự thêm hoặc bỏ phân công dự án.

## Cấu trúc thực tế

```text
frontend/
  index.html
  login.html
  news.html
  department.html
  work.html
  admin.html
  assets/
    css/
      fonts.css
      tokens.css
      base.css
      layout.css
      components.css
      effects.css
      pages.css
    js/
      core/
        app.js
        data-source.js
        demo-session.js
        ui.js
      data/
        mock-data.js
      components/
        header.js
        notifications.js
        member-carousel.js
        company-directory.js
        project-card.js
        task-drawer.js
        modal.js
      pages/
        home.js
        login.js
        news.js
        department.js
        work.js
        admin.js
    images/
      favicon.svg
      portrait-fallback.svg
      office.jpg
      an.jpg
      minh.jpg
      linh.jpg
      ha.jpg
      nam.jpg
      mai.jpg
      leader-khang.jpg
      leader-ngoc.jpg
      leader-huy.jpg
    fonts/
      font-1.ttf ... font-9.ttf
      BeVietnamPro-OFL.txt
      Manrope-OFL.txt
    vendor/bootstrap/
      bootstrap.min.css
      bootstrap.bundle.min.js
      LICENSE
backend/
  src/
    auth/
      auth-service.js
      password.js
      session-store.js
    cli/set-password.js
    db/pool.js
    repositories/
      account-repository.js
      announcement-repository.js
      audit-repository.js
      admin-user-repository.js
      department-repository.js
      directory-repository.js
      notification-repository.js
      work-repository.js
    server.js
  Dockerfile
database/
  init/001_create_app_role.sh
  migrations/
    010_schema.sql
    020_demo_data.sql
    030_public_directory_job.sql
    040_auth_sessions.sql
    050_user_username_ci.sql
    060_audit_log.sql
  migrate.js
  migrator.Dockerfile
nginx/
  Dockerfile
  default.conf
docker-compose.yml
docs/
  design-system.md
  ui-specification.md
  future-integration.md
  assets.md
  testing.md
  references/                 # Chưa có tài liệu tham khảo do người dùng cung cấp
tools/
  backup-db.sh
  restore-db.sh
  serve.mjs
  check.mjs
  browser-smoke.mjs
  create-pages.mjs
  download-assets.ps1
  fonts-source.css
tests/
  data-source.test.mjs
.gitignore
package.json
README.md
```

`create-pages.mjs` tạo các HTML entry point có cùng bộ tài nguyên; chạy `node tools/create-pages.mjs` nếu thay template. `download-assets.ps1` là công cụ tải lại tài nguyên, không chạy khi sử dụng website. `.qa/` là dữ liệu kiểm tra cục bộ được bỏ qua bởi Git.

## Kiểm tra

```powershell
node tools/check.mjs
node --test tests/data-source.test.mjs
```

Browser smoke test tùy chọn dùng Chrome cài sẵn trên Windows; không cần cho việc chạy frontend:

```powershell
npm.cmd install --prefix .qa --no-save --package-lock=false playwright-core@1.55.1
node tools/serve.mjs
# Trong terminal thứ hai:
node tools/browser-smoke.mjs
```

Nếu Chrome ở vị trí khác, đặt `$env:CHROME_PATH` trước khi chạy. Script browser giả định cổng 5500 và tạo ảnh / kết quả trong `.qa/`. Chi tiết phạm vi và giới hạn kiểm tra ở [docs/testing.md](docs/testing.md).

## Tài nguyên, giới hạn và bước tiếp theo

Bootstrap, font, icon SVG, ảnh đều cục bộ. Nguồn và giấy phép tại [docs/assets.md](docs/assets.md). Tên công ty, logo, ảnh văn phòng/nhân viên, số KPI và toàn bộ nội dung đều minh họa, cần thay bằng tài nguyên doanh nghiệp được duyệt. Chưa có ảnh chụp UI do người dùng cung cấp; thiết kế tuân theo mô tả cụ thể trong yêu cầu và các nguồn tham khảo được ghi trong tài liệu.

Website đã có Backend Node.js và PostgreSQL chạy qua Docker Compose. API cung cấp health check, bản tin, thống kê, danh bạ và xác thực phiên (`/api/auth/login`, `/api/auth/logout`, `/api/me`). Trang chủ, Bản tin và danh bạ đọc dữ liệu từ API; chế độ `?demo=1` tiếp tục dùng dữ liệu mẫu cho phần xem thử.

Đăng nhập và session đã hoạt động qua HTTPS lab với certificate tự ký. Trang Work, Phòng ban và thông báo cá nhân dùng API có kiểm tra session; API quản trị người dùng chỉ cho ADMIN, hỗ trợ tạo/sửa/kích hoạt/vô hiệu hóa và thu hồi phiên khi vô hiệu hóa. Người dùng có thể tự đổi mật khẩu sau khi xác nhận mật khẩu hiện tại; khởi tạo/đặt lại mật khẩu vẫn do quản trị viên xử lý qua CLI. PostgreSQL ghi lịch sử migration trong `schema_migrations`. Xem cách đặt mật khẩu/TLS trong [docs/docker-deployment.md](docs/docker-deployment.md), cùng kế hoạch còn lại tại [docs/future-integration.md](docs/future-integration.md).
