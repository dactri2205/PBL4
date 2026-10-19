# An Việt — Cổng thông tin nội bộ

Frontend tiếng Việt cho một doanh nghiệp hư cấu, xây từ thư mục trống theo hệ thiết kế Dark Cyan Gradient + Minimal Light UI. Gồm 6 trang hoạt động, dữ liệu mẫu tập trung và các tương tác thực tế trong phiên trình duyệt.

## Chạy cục bộ

Cần Node.js hiện đại, không cần cài dependency để chạy ứng dụng. Trong PowerShell tại thư mục gốc:

```powershell
node tools/serve.mjs
```

Mở **http://localhost:5500/**. Dừng bằng `Ctrl+C`. Có thể dùng `npm start` hoặc `npm.cmd start` trên Windows. Muốn đổi cổng: `$env:PORT=5501; node tools/serve.mjs`.

Nếu đã cài Python:

```powershell
py -m http.server 5500 --directory frontend --bind 127.0.0.1
```

Không mở HTML bằng `file://` vì ứng dụng sử dụng ES Modules. `tools/serve.mjs` chỉ là máy chủ file cho phát triển cục bộ, không phải Backend ứng dụng.

## Công nghệ

HTML5, CSS3 với Design Tokens, Vanilla JavaScript ES6+ / Native ES Modules, Bootstrap **5.3.3** cục bộ. Không có framework, bundler hoặc bước build. Bootstrap dùng cho grid và utility; các thành phần tùy biến dùng tên theo chức năng, không có tiền tố. Dùng các tên như `surface-card`, `data-table`, `status-badge` để tránh trùng class Bootstrap. Hai font chính là Manrope và Be Vietnam Pro, lưu cục bộ dạng TTF do tài nguyên Google Fonts trả về định dạng này. Không có yêu cầu kết nối internet lúc chạy.

## Các trang và chức năng

| Trang             | Chức năng                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`      | Hero chia đôi, gradient đen–teal–cyan, ảnh văn phòng, latest update pill, 4 KPI, giá trị tập thể                                                |
| `login.html`      | Thẻ đăng nhập giữa trang, username/password, nhãn phía trên, không placeholder, hiện/ẩn mật khẩu, kiểm tra bắt buộc và phản hồi chưa có Backend |
| `news.html`       | Danh sách bản tin, lọc chuyên mục, tìm kiếm, đọc bài qua `?article=n1`                                                                          |
| `department.html` | Bento phòng ban, mục tiêu chung, thành viên dạng carousel ảnh với tilt 3D, dự án đúng phân công                                                 |
| `work.html`       | Thẻ dự án, viền trong khi hover/focus, bảng việc với 6 cột, tìm kiếm/lọc, drawer và cập nhật trạng thái mẫu                                     |
| `admin.html`      | Bảng người dùng tách Vai trò / Phòng ban, tìm kiếm/lọc, xem/thêm/sửa, xác nhận đổi quyền và kích hoạt/vô hiệu hóa, khôi phục dữ liệu            |

Header dùng chung, icon + chữ và gạch dưới mục hiện tại, menu thu gọn trên tablet/mobile, profile dropdown và thông báo cá nhân có trạng thái đã đọc. Dialog hỗ trợ Escape, focus được giới hạn bởi native `<dialog>`, đóng trả focus về phần tử mở nếu còn tồn tại. Giảm chuyển động được tôn trọng.

## Development Preview

Ở trang chủ, có thể bấm KPI **Thành viên** hoặc **Phòng ban** ngay cả ở giao diện khách để xem profile giới thiệu công khai. Modal Thành viên mặc định có carousel lãnh đạo/trưởng phòng và tìm kiếm toàn đội ngũ (hỗ trợ không dấu); modal Phòng ban cho chọn phòng, xem carousel đội ngũ và quay lại. Dữ liệu ban đầu gồm **9 thành viên hoạt động** (6 tài khoản mẫu + 3 hồ sơ Ban điều hành) và **2 phòng ban**; KPI được tính từ dữ liệu thay cho số minh họa cũ. Profile Ban điều hành không phải tài khoản đăng nhập, và chức danh trưởng phòng độc lập với quyền ADMIN/EMPLOYEE.

Mở **http://localhost:5500/?demo=1** để hiện thanh chọn người dùng mẫu. Thanh này không xuất hiện trong giao diện mặc định. Chế độ được giữ trong `sessionStorage` của tab hiện tại để có thể di chuyển giữa các trang.

| Lựa chọn | Vai trò / phòng ban | Phân công                                        |
| -------- | ------------------- | ------------------------------------------------ |
| Khách    | Không có phiên      | Chỉ trang chủ và bản tin công khai               |
| Minh     | EMPLOYEE / IT       | Alpha, các việc `t1`–`t4`                        |
| Linh     | EMPLOYEE / IT       | Beta, các việc `t5`–`t6`                         |
| Hà       | EMPLOYEE / Nhân sự  | Hành trình hội nhập, việc `t7`; thông báo rỗng   |
| Mai      | EMPLOYEE / IT       | Alpha; không có công việc được giao              |
| An       | ADMIN / IT          | Xem toàn bộ dự án/việc và quản lý người dùng mẫu |

Không có mật khẩu mẫu và không có xác thực thật. Gửi form đăng nhập không gửi mật khẩu đi đâu; form hiển thị thông báo Backend chưa kết nối. Đổi trạng thái công việc, thông báo, người dùng chỉ lưu trong phiên; không thay đổi máy chủ. Tài khoản mẫu bị vô hiệu hóa sẽ không có nội dung riêng tư khi chọn. Không cho tự vô hiệu hóa/hạ quyền quản trị hiện tại để giữ khả năng tiếp tục xem thử.

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
docs/
  design-system.md
  ui-specification.md
  future-integration.md
  assets.md
  testing.md
  references/                 # Chưa có tài liệu tham khảo do người dùng cung cấp
tools/
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

Toàn bộ dữ liệu mẫu có thể đọc được trong mã phía trình duyệt. Các điều kiện hiển thị chỉ mô phỏng luồng sử dụng, **không phải bảo mật hoặc phân quyền thật**. Chưa có Backend, Database, Docker, Nginx, Mini VPN, email, upload hoặc lưu dữ liệu máy chủ.

Bước tiếp theo là thay adapter dữ liệu bằng API có xác thực, kiểm tra phân quyền ở máy chủ, sau đó triển khai Database và hạ tầng theo [docs/future-integration.md](docs/future-integration.md). Không có thành phần hạ tầng nào được triển khai trong giai đoạn này.
