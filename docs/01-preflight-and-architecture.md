# Giai đoạn 1–2: điều kiện chạy và kiến trúc

## Khảo sát trong workspace hiện tại

- Windows `10.0.26200`; .NET SDK `10.0.401`, runtime `10.0.12`.
- Phiên làm việc hiện tại **không có quyền Administrator**. Truy vấn `Get-NetIPAddress` và `Get-NetAdapter` bị từ chối quyền, nên chưa xác định được IP LAN.
- Chạy `powershell -ExecutionPolicy Bypass -File .\scripts\Preflight.ps1` **trên cả A và B**, trong PowerShell Administrator. Cả hai cần .NET 10 và Wintun x64; Docker chỉ cần nếu sau này thay website mẫu bằng container.
- Các thao tác cần Administrator: tạo Wintun adapter, gán IP và route, cấu hình Windows Firewall. IP LAN hai máy phải kết nối TCP trực tiếp được, không có Wi-Fi client isolation.

## Đường đi dữ liệu dự kiến

```mermaid
flowchart LR
  B[Browser B] -->|10.8.0.1:8080| TB[Wintun B 10.8.0.2/32]
  TB --> CB[MiniVpnClient]
  CB -->|TLS/TCP LAN A:42424| SA[MiniVpnServer]
  SA --> TA[Wintun A 10.8.0.1/24]
  TA --> WA[Windows TCP/IP]
  WA --> R[Relay bind 10.8.0.1:8080]
  R -->|127.0.0.1:18080| W[MiniVpn.InternalWeb trên A]
```

Gói về đi ngược: website mẫu trên A → relay trên A → TCP/IP Windows nguồn `10.8.0.1`, đích `10.8.0.2` → Wintun A → server chọn phiên theo IP đích → TLS → client → Wintun B → browser. Relay tạo **một kết nối TCP mới** tới website loopback. Khi thay website mẫu bằng Docker, chỉ publish website vào `127.0.0.1:18080`, không publish DB ra host. [Docker xác nhận host IP trong Compose](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/).

| Thành phần | Địa chỉ/cổng | Kiểm soát |
| --- | --- | --- |
| TLS server A | IP LAN A:42424 | Windows Firewall chỉ cho IP LAN B; TLS và xác thực VPN |
| Wintun A | 10.8.0.1/24 | Server chỉ nhận IPv4 nguồn đã cấp, đích 10.8.0.1, TCP 8080 hoặc ICMP echo |
| Wintun B | 10.8.0.2/32 hoặc .3/32 | Route on-link `10.8.0.1/32`, không đổi default gateway |
| Relay A | 10.8.0.1:8080 | Chỉ chấp nhận IP phiên VPN đang hoạt động |
| Website mẫu trên A | 127.0.0.1:18080 | Chỉ A truy cập trực tiếp; LAN B không thấy cổng này |

Để hoàn thành demo, kiểm tra trên hai máy thật rằng trang `http://10.8.0.1:8080` tải được từ B khi đã kết nối VPN và không tải được trước/sau khi kết nối. Xem [quy trình thử website](04-internal-web-demo.md). [Wintun API](https://git.zx2c4.com/wintun/tree/api/wintun.h) cung cấp đọc/ghi packet; [Windows New-NetRoute](https://learn.microsoft.com/en-us/powershell/module/nettcpip/new-netroute) hỗ trợ route theo interface index. TLS/TCP chứa TCP có thể gây head-of-line blocking và giảm thông lượng khi mất gói, phù hợp phạm vi demo chứ không phải VPN hiệu năng cao.
