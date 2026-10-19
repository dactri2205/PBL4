# Đặc tả UI đã triển khai

## Shell và phiên xem thử

Header chia ba phần: logo bên trái, icon + chữ ở giữa, điều khiển phiên bên phải. Gạch dưới mục hiện tại. Khách chỉ có Trang chủ/Bản tin và nút đăng nhập. Nhân viên có Phòng ban/Công việc, chuông thông báo và profile. ADMIN thêm Quản trị. Không có sidebar.

`?demo=1` bật thanh Development Preview. Đổi người dùng reload trang để toàn bộ header, nội dung và phạm vi dữ liệu đồng nhất. Tài khoản bị vô hiệu hóa được xử lý như khách. Điều kiện này chỉ phục vụ minh họa phía client.

## Trang chủ

Hai KPI Thành viên / Phòng ban là button mở modal rộng. Thành viên mặc định hiện 5 lãnh đạo và trưởng phòng bằng carousel ảnh + tilt 3D; tìm kiếm theo tên/chức danh/phòng ban có hoặc không dấu trong toàn bộ danh sách, xóa từ khóa về nhóm lãnh đạo. Có số kết quả, empty state và nút xóa. Phòng ban mở carousel các phòng; chọn phòng thay nội dung modal bằng carousel thành viên đúng phòng, có tìm kiếm trong phòng và nút quay lại. Không tự chạy carousel.

API `getCompanyDirectory()` chỉ trả profile công khai (tên, chức danh, phòng ban, ảnh và cờ giới thiệu lãnh đạo), không trả username, quyền tài khoản, trạng thái, dự án hoặc công việc. Hồ sơ giới thiệu và vai trò quản trị độc lập. KPI lấy số lượng thành viên đang hoạt động + hồ sơ Ban điều hành, số phòng ban từ chính danh sách; dữ liệu ban đầu có 9 người và 2 phòng, thay số minh họa 128/08 trước đây.

Hero split, tiêu đề Việt, CTA đến bản tin, ảnh văn phòng bên phải, gradient và technical grid. Không lặp nút đăng nhập trong Hero. Latest Update Pill dẫn đến bài công khai cụ thể; không dùng chung dữ liệu với chuông cá nhân. Bốn KPI đồng đều và phần giá trị ngắn, không gallery bản tin hoặc chart.

## Đăng nhập

Card trắng chính giữa, radius 20px, shadow mềm. Username và password có nhãn trên input, không placeholder, không đăng ký hoặc social login. Toggle mật khẩu có aria-pressed và nhãn đổi theo trạng thái. Submit kiểm tra bắt buộc, báo lỗi inline, vô hiệu hóa tạm thời nút khi kiểm tra, rồi thông báo chưa kết nối Backend. Không gửi hoặc lưu mật khẩu.

## Bản tin

Danh sách có ngày, nhãn chuyên mục, tiêu đề, tóm tắt, mũi tên. Lọc chuyên mục và tìm kiếm kết hợp; count thông báo qua aria-live. Không có kết quả hiển thị empty state. Bài đọc dùng `?article=<id>` với link quay lại. ID không tồn tại trở về danh sách.

## Phòng ban

Bento liền mạch với giới thiệu, số thành viên hoạt động, số dự án theo phạm vi người xem, mục tiêu chung. Carousel ngang dùng ảnh overlay tên/chức danh, prev/next, native touch scroll, kéo chuột, phím trái/phải và tilt. Ẩn điều khiển khi không có phần tràn, vô hiệu hóa nút ở đầu/cuối. Dự án cá nhân đúng assignment; không suy ra assignment từ department.

## Công việc

Thẻ dự án có tên, mô tả, trạng thái, tiến độ, số thành viên và ngày hạn. Nhấn thẻ mở modal chi tiết thành viên. Bảng đúng 6 cột: Công việc, Dự án, Trạng thái, Ưu tiên, Hạn hoàn thành, Thao tác. Workflow gồm Chờ thực hiện/Đang thực hiện/Hoàn thành. Nhãn quá hạn được suy ra theo ngày tại Asia/Bangkok và chưa hoàn thành.

Tìm kiếm và lọc dự án/trạng thái kết hợp. Task hoặc nút mũi tên mở drawer phải, hiển thị mô tả, dự án, người thực hiện, ưu tiên, ngày tạo, hạn và mã việc. Select đổi trạng thái chỉ lưu mẫu trong phiên. Không có việc phù hợp hiển thị dòng trống có giải thích.

## Quản trị

Bảng gồm Ảnh, Tên/Tên đăng nhập, Vai trò, Phòng ban, Trạng thái, Thao tác. ADMIN/EMPLOYEE và Active/Disabled là dữ liệu độc lập với phòng ban. Có xem thông tin, modal thêm/sửa, đổi vai trò/phòng ban/trạng thái. Đổi quyền hoặc trạng thái cần xác nhận; tên/username được escape khi render. Thêm người dùng kiểm tra username hợp lệ và không trùng, không tạo mật khẩu hoặc tài khoản thật. Không có last seen bịa đặt.

Không cho hạ quyền hoặc vô hiệu hóa tài khoản admin đang xem. Reset mẫu có xác nhận. User mới không tự có dự án hay nhiệm vụ. Truy cập trực tiếp trang quản trị bằng khách/nhân viên hiển thị trạng thái hạn chế thay cho dữ liệu bảng.

## Thông báo và dialog

Chuông chỉ có ở phiên người dùng. Dropdown nền trắng, scroll list, badge chưa đọc, đọc một/đọc tất cả và cập nhật count. Outside click hoặc Escape đóng. Click thông báo công việc mở đúng drawer được phân công. Khi thay đổi từ notification drawer, trang Work nhận sự kiện cập nhật để vẽ lại.

Dialog dùng phần tử native, close button có tên, Escape, backdrop click bên ngoài, khóa scroll và trả focus khi đóng. Drawer và modal vừa màn hình nhỏ. Có vòng lặp Tab/Shift+Tab tường minh bên cạnh hành vi native dialog; tab order do cấu trúc biểu mẫu xác định.
