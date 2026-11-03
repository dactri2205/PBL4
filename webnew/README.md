# An Việt — Website và quản trị MiniVPN đã hợp nhất

Thư mục này chứa frontend An Việt, Node.js API, PostgreSQL migrations và dashboard quản trị VPN. Đây là nguồn website duy nhất sau khi ghép.

## Khởi động

Xem [hướng dẫn tích hợp đầy đủ](docs/integrated-deployment.md). Thứ tự: DB/migration/API trong Docker → MiniVPN server → gateway .NET → watchdog.

Gateway .NET trên laptop A giữ cổng loopback 18080, phục vụ `frontend/` và proxy API nghiệp vụ tới loopback 13000. Quản trị VPN gọi control API trong process MiniVPN trên loopback 18181. Không mở các API/DB ra LAN.

Đăng nhập website bằng ADMIN thật rồi mở menu tài khoản → Quản trị VPN. Không dùng mật khẩu admin VPN thứ hai ở chế độ mặc định. Tài khoản VPN trong accounts.json vẫn độc lập với người dùng website.

## Các trang

| Trang | Chức năng |
| --- | --- |
| index.html | Trang chủ, thống kê và danh bạ công khai |
| login.html | Đăng nhập website, chuyển về trang nội bộ theo allowlist |
| news.html | Bản tin và tìm kiếm |
| department.html | Phòng ban, thành viên và dự án |
| work.html | Dự án/công việc theo phân công, cập nhật trạng thái |
| admin.html | Quản lý người dùng website bằng ADMIN thật |
| vpn-admin.html | Tài khoản VPN, phiên thật, log, metrics và cảnh báo |

Role, trạng thái và phiên được xác minh ở backend. Khóa/đổi quyền/reset mật khẩu website thu hồi phiên tương ứng, làm mất quyền VPN ở request tiếp theo. Logout dashboard kết thúc phiên website hiện tại. `?demo=1` vẫn dùng dữ liệu mẫu cho các trang nghiệp vụ và không cấp quyền VPN.

Website dùng HTML/CSS/Vanilla JavaScript ES Modules, Bootstrap, font và ảnh cục bộ. Adapter nghiệp vụ ở `frontend/assets/js/core/data-source.js`; adapter VPN riêng ở `frontend/assets/js/services/vpn-api.js`. Không fallback dữ liệu mẫu khi API thật lỗi.

## Cấu trúc

- `frontend/`: FE, trang và assets local.
- `backend/src/`: Node.js auth, session, repository và API nghiệp vụ.
- `database/`: migrations có checksum, runner và Dockerfiles.
- `nginx/`: profile standalone xem riêng website, không dùng làm gateway VPN.
- `tests/`: test frontend/adapter.
- `tools/`: kiểm tra, browser QA, backup/restore và fixture test.

BE VPN và gateway dùng chung ở các project `../src/MiniVpn.Management`, `MiniVpn.Server`, `MiniVpn.InternalWeb`, `MiniVpn.Watchdog`.

## Kiểm tra

```powershell
npm.cmd run check
npm.cmd test
```

Để kiểm thử cả PostgreSQL thật, gateway HTTPS, SSO và Chrome, làm theo [hướng dẫn test tích hợp](docs/integrated-deployment.md). Ảnh/kết quả ở `.qa/vpn-browser/`, không đưa lên Git. Test fixture chỉ dùng DB/container riêng và không nằm trong image backend.

Để xem riêng frontend bằng Node: `npm.cmd start`, mở `http://localhost:5500/?demo=1`. Server này không có API thật. Dùng profile Nginx riêng theo [Docker deployment](docs/docker-deployment.md) khi cần.

## Tài liệu

- [Cấu hình và khởi động bản ghép](docs/integrated-deployment.md)
- [Docker, migration, backup và restore](docs/docker-deployment.md)
- [API quản trị VPN](../docs/06-vpn-api.md)
- [Vận hành VPN, log và cảnh báo](../docs/05-vpn-administration.md)
- [Design system](docs/design-system.md)
- [Tài nguyên và giấy phép](docs/assets.md)
- [Phạm vi kiểm thử](docs/testing.md)

Tên công ty, nội dung, ảnh và tài khoản seed phục vụ minh họa. Không có mật khẩu seed mặc định; tạo mật khẩu bằng CLI tương tác. Không đưa .env, dump DB, PFX/private key, cookie hoặc token lên Git.
