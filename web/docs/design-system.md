# Hệ thiết kế An Việt

## Màu sắc và thương hiệu

Nguồn duy nhất là `frontend/assets/css/tokens.css`. Trang nền `#F7F9FA`, bề mặt `#FFFFFF`, viền `#E2E8EC`, chữ chính `#14232B`, chữ phụ `#5B6871`, accent `#087A91`, hover `#075F70`, nền chọn `#E7F5F7`.

Hero dùng gradient góc 155° qua `#05080C`, `#073544`, `#0C7289`, `#16ABC7`, đưa cyan xuống vùng dưới/phải. Grid 48px mờ với mask để nền không lấn nội dung. Chữ trắng nằm trên vùng tối; tiêu đề nhấn cyan nhạt. Bảng, form và card dữ liệu dùng nền sáng.

Ngữ nghĩa: hoàn thành `#166534`, đang làm `#087A91`, cảnh báo `#92400E`, lỗi/quá hạn `#B42318`, chờ `#64748B`; luôn có nhãn chữ trên nền nhạt. Quá hạn suy ra từ ngày và trạng thái, không thay thế trạng thái quy trình.

## Kiểu chữ và khoảng cách

Ưu tiên sử dụng trên laptop/desktop 1280–1920px. Cỡ chữ được thống nhất trong `tokens.css`: nội dung và input 16px, giao diện/menu/nhãn/bảng 14px, nút chính 15px, chữ phụ 13px và chú thích 12px. Mô tả Hero 16px, line-height 1.75; giữ nguyên cỡ tiêu đề Hero. Đây là mức chữ đã điều chỉnh theo phản hồi người dùng để đọc rõ hơn trên laptop; không có yêu cầu tối ưu thêm giao diện mobile trong lần sửa này.

Manrope cho tiêu đề/KPI; Be Vietnam Pro cho nội dung, nhãn, nút và bảng. TTF có tiếng Việt được lưu cục bộ; Manrope có fallback Be Vietnam Pro. Trọng lượng 400–800 tùy chức năng. Body line-height 1.75, Hero 1.17. Heading co giãn theo viewport, tối thiểu 30px ở các trang dữ liệu; Hero 35–58px theo breakpoint.

Token khoảng cách 4, 8, 12, 16, 20, 24, 32, 48, 64, 80px. Container tối đa 1280px; gutter desktop 24–32px, mobile 16–20px. Home rộng rãi, task/admin gọn hơn. Khoảng cách section 64px desktop / 44px mobile.

## Bề mặt

Viền 1px, shadow tối thiểu. Radius input 10px, bảng/dropdown 12px, card 16px, ảnh thành viên 18px, modal/login/bento 20px. Shadow mềm chỉ dùng ở login, dialog và dropdown. Bento có viền ngoài bo tròn, đường chia trong liên tục; không bo riêng từng ô.

## Nút

Nút quan trọng giữ nền trắng, chữ đen, viền đen và pill `10em`. Hover translate(-2px,-4px), hard shadow `2px 5px 0 0 #000`; active translate(1px,2px), bỏ shadow; transition 300ms. Không đổi nút chính sang teal. Nút phụ/icon dùng đổi màu và viền nhẹ. Keyboard focus 3px cyan với offset.

## Chuyển động đã chọn

- Navbar: hover đổi chữ/icon sang teal, gạch chân mở từ giữa trong 220ms, icon nâng 2px. Gạch chân mục hiện tại luôn hiện; keyboard focus cũng hiện gạch chân.
- KPI: hover nâng 4px trong 250ms, viền teal nhạt và bóng mềm; icon scale 1.1, số đổi teal. Thẻ vẫn là thông tin, không thêm cursor hoặc thao tác giả.
- Ô giá trị: hover nền teal rất nhạt, nét trên mở từ trái sang phải trong 250ms; số và tiêu đề nhấn teal. Chữ và đường chia giữ vị trí.

- Project Card: pseudo-element viền teal ban đầu inset 4px, opacity 0 và rotate 5°. Hover/focus-within về inset 15px, rotate 0°, opacity 1 trong 500ms. Không dịch chuyển chữ, không scale thẻ; viền `pointer-events:none`.
- Thành viên: perspective 1000px, tối đa 6° mỗi trục, theo pointer; trả về khi rời thẻ. Chỉ bật với pointer chính xác có hover. Không tilt khi kéo carousel hoặc khi giảm chuyển động.
- Dropdown: fade và dịch xuống 6px, 190ms.
- Modal: fade, translateY 10px và scale .98→1 trong 220ms.
- Drawer: trượt từ phải trong 280ms; backdrop nhẹ, khóa cuộn nền.
- Không autoplay carousel, không thư viện animation.
- `prefers-reduced-motion: reduce`: bỏ animation/transition, tilt và scroll mượt; giữ nguyên khả năng tương tác.

## Responsive và khả năng truy cập

Navbar thu gọn ở ≤991px để đủ chỗ cho quản trị. Layout nội dung đổi ở 767px, bento về hai cột thống kê và một dòng mô tả, Hero xếp dọc. KPI dùng grid Bootstrap 1/2/4 cột. Bảng có vùng cuộn riêng, không làm cuộn cả trang. Drawer rộng tối đa 490px, vừa viewport nhỏ.

Native dialog quản lý focus và Escape; điều hướng là link thật; action là button; input có label; active nav dùng aria-current; dropdown/menu có aria-expanded; carousel có tên truy cập và phím trái/phải; ảnh có alt hoặc alt rỗng khi trang trí.

## Tham khảo

Không có ảnh tham khảo được cung cấp trong workspace. Các hiệu ứng được tự triển khai từ thông số đã duyệt: hướng bố cục [Tailark Hero Section 6](https://mcp.21st.dev/%40meschacirung/components/hero-section-6), nút trắng/đen theo lựa chọn Uiverse của sekaiking, và viền card theo lựa chọn Smit-Prajapati trong brief. Không sao chép React/Tailwind hay dùng screenshot làm nội dung.
