# Kết quả kiểm tra

Thực hiện bằng Node.js và Chrome headless cài sẵn trên Windows trong workspace. Browser automation là công cụ kiểm tra riêng trong `.qa/`, không phải dependency của ứng dụng.

## Kiểm tra tĩnh và dữ liệu

`node tools/check.mjs`: kiểm tra syntax tất cả module JavaScript, đường dẫn asset/import tĩnh, đủ 6 HTML và không có dependency mạng trong runtime. `node --test tests/data-source.test.mjs`: 9 ca đã qua:

1. Khách thấy nội dung công khai, không có dữ liệu riêng.
2. Hai nhân viên cùng IT thấy dự án và việc khác nhau; không đổi được việc ngoài phân công mẫu.
3. Trạng thái workflow được kiểm tra; cập nhật vào phiên mẫu.
4. Thông báo cá nhân và đọc tất cả không ảnh hưởng người khác.
5. Nhân viên không có API mô phỏng quản lý người dùng.
6. Đổi phòng ban khác với quyền và assignment.
7. Tài khoản mẫu bị vô hiệu hóa không có dữ liệu riêng.
8. Bảo vệ admin hiện tại, kiểm tra username trùng, thêm người dùng và empty state.
9. Danh bạ công khai không lộ dữ liệu tài khoản/assignment, KPI và số người theo phòng khớp danh sách, trưởng phòng không mặc nhiên có quyền ADMIN.

Đây là kiểm thử hành vi mock phía client, không chứng minh phân quyền bảo mật ở server.

## Kiểm tra trình duyệt

`node tools/browser-smoke.mjs` đã qua các luồng sau:

- Tất cả 6 trang phản hồi HTTP 200 và khởi tạo thành công.
- Home có Hero, 4 KPI, điều hướng khách và font cục bộ.
- Bản tin tìm kiếm được và mở đúng bài đọc.
- Login không có placeholder; kiểm tra bắt buộc, hiện mật khẩu, phản hồi chưa có Backend.
- Chọn Minh/Linh cùng phòng ban cho kết quả dự án và task khác nhau.
- Mai có task empty state.
- Drawer mở, đóng bằng Escape, đổi trạng thái và bảng cập nhật đúng bộ lọc.
- Dropdown thông báo cá nhân, đọc tất cả, count và Escape.
- Bento phòng ban, tilt 3D theo pointer, viền trong về inset 15px và không chặn pointer, carousel điều khiển bằng bàn phím.
- Modal giữ Tab bên trong, Escape đóng và trả focus về nút mở.
- Quản trị đổi role với bước xác nhận, thêm user, escape tên chứa HTML, vô hiệu hóa có xác nhận.
- Cả 6 trang không tràn ngang toàn trang ở 1440, 1280, 768, 390 và 320px. Bảng vẫn giữ vùng cuộn riêng.
- Menu mobile mở/đóng và drawer vừa màn hình.
- Reduced-motion vô hiệu hóa transition.
- Không có pageerror JavaScript, tài nguyên HTTP lỗi hoặc request đến máy chủ bên ngoài khi chạy.

Ảnh kiểm tra sinh ở `.qa/screenshots/`; kết quả có cấu trúc tại `.qa/results.json`. Đã quan sát ảnh desktop/mobile cho Home, phòng ban, quản trị, login và drawer. Trong quá trình QA đã sửa breakpoint menu tablet và chiều rộng card login trên mobile.

## Bổ sung hiệu ứng hover trên laptop

Lần bổ sung hover trên laptop đã kiểm tra bằng Chrome: navbar mở/thu gạch chân, giữ gạch chân trang hiện tại và hỗ trợ keyboard focus; KPI nâng 4px, icon scale 1.1, đổi màu số và không dịch các thẻ lân cận; ô giá trị đổi nền/nét trên mà chữ không dịch chuyển. Reduced-motion tắt nâng/scale icon. Không tràn trang ở 1280, 1366, 1440 và 1920px, không có lỗi JavaScript trong lượt kiểm tra này.

## Modal danh bạ thành viên và phòng ban

Modal danh bạ mới đã được kiểm tra bằng Chrome với Live Server đang chạy: mặc định chỉ lãnh đạo/trưởng phòng; tìm kiếm toàn công ty không phân biệt dấu/hoa thường; xóa từ khóa; không có kết quả; nút trước/sau, bàn phím, kéo chuột và tilt; chọn phòng, tìm trong phòng và quay lại; Escape trả focus; reduced-motion; không tràn ngang ở 1280–1920px. Carousel trang phòng ban vẫn hoạt động, không có pageerror hoặc ảnh thiếu trong lượt này.

## Giới hạn

Chưa kiểm thử trên Safari/Firefox, thiết bị cảm ứng vật lý hoặc screen reader. Các kiểm tra Chrome dùng kích thước viewport mobile; không thay cho đánh giá đầy đủ bằng thiết bị thật. Chưa làm audit WCAG tự động/toàn diện. Không có API, Database, đăng nhập thật hay hạ tầng để kiểm tra. Chưa có ảnh thiết kế người dùng cung cấp để đối chiếu từng pixel.
