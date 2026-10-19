# Tài nguyên cục bộ và nguồn

Ứng dụng không gọi CDN, Google Fonts hoặc Unsplash lúc chạy. Tải tài nguyên chỉ diễn ra ở giai đoạn chuẩn bị. Các tệp font/ảnh đã nằm trong `frontend/assets/`.

## Bootstrap

Bootstrap 5.3.3 từ `https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/`, gồm CSS và JS bundle chính thức. Giấy phép MIT giữ trong `frontend/assets/vendor/bootstrap/LICENSE`. Website dùng Bootstrap cho grid/utility, không dùng các component kiểu mặc định để thay thế hệ thiết kế.

## Font

Google Fonts: Be Vietnam Pro 400/500/600/700 và Manrope 400/500/600/700/800. `tools/fonts-source.css` lưu CSS nguồn trả về; `fonts.css` thay URL thành đường dẫn cục bộ. Be Vietnam Pro là `font-1`–`font-4`, Manrope là `font-5`–`font-9`. Định dạng tải được là TTF đầy đủ thay vì WOFF2; hai họ có hỗ trợ tiếng Việt. Giấy phép SIL Open Font License được lưu cùng tài nguyên.

Nguồn: [Be Vietnam Pro](https://fonts.google.com/specimen/Be+Vietnam+Pro), [Manrope](https://fonts.google.com/specimen/Manrope). Muốn tối ưu WOFF2 sau, cần giữ cả tập ký tự tiếng Việt và giấy phép.

## Ảnh minh họa

Ảnh từ Unsplash, được tải với `auto=format&fit=crop&w=...&q=85` và lưu JPEG. Dùng theo [Unsplash License](https://unsplash.com/license). Tên người mẫu không được gắn với danh tính thật của người trong ảnh; tên nhân viên trong ứng dụng hoàn toàn hư cấu.

| File               | Nguồn ảnh gốc                                                  |
| ------------------ | -------------------------------------------------------------- |
| `office.jpg`       | `https://images.unsplash.com/photo-1497366754035-f200968a6e72` |
| `minh.jpg`         | `https://images.unsplash.com/photo-1500648767791-00dcc994a43e` |
| `linh.jpg`         | `https://images.unsplash.com/photo-1580489944761-15a19d654956` |
| `an.jpg`           | `https://images.unsplash.com/photo-1506794778202-cad84cf45f1d` |
| `ha.jpg`           | `https://images.unsplash.com/photo-1534528741775-53994a69daeb` |
| `nam.jpg`          | `https://images.unsplash.com/photo-1472099645785-5658abf4ff4e` |
| `mai.jpg`          | `https://images.unsplash.com/photo-1531123897727-8f129e1688ce` |
| `leader-khang.jpg` | `https://images.unsplash.com/photo-1519085360753-af0119f7cbe7` |
| `leader-ngoc.jpg`  | `https://images.unsplash.com/photo-1573496359142-b8d87734a5a2` |
| `leader-huy.jpg`   | `https://images.unsplash.com/photo-1560250097-0b93528c311a`    |

`portrait-fallback.svg`, favicon, logo và icon nét là hình vector tự tạo trong dự án. Người dùng chưa có ảnh dùng initials trong avatar và silhouette trong carousel. Không dùng logo công ty khác hay ảnh chụp UI làm thành phần website.

## Cần thay khi dùng thật

Tên/logo doanh nghiệp, ảnh Hero, chân dung được cho phép sử dụng, nội dung bản tin, tên/chức danh/phòng ban, KPI và thông tin dự án mẫu. Không cần thay các tài nguyên này để chạy bản demo offline.
