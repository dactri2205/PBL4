# API quản trị VPN và đăng nhập dùng chung

Browser gọi cùng origin /api/vpn/*. Gateway .NET xác minh session website bằng GET /api/me tới Node trên loopback rồi gọi control API /control trong chính MiniVPN server. Control token không đi xuống JavaScript.

## Identity, session và CSRF

Chế độ mặc định là VpnAdmin.AuthenticationMode=Portal. Đăng nhập tại POST /api/auth/login bằng tài khoản PostgreSQL, cookie __Host-avsid (HTTPS) hoặc avsid (Development HTTP). ADMIN thật được gateway ánh xạ sang VPN_ADMIN; EMPLOYEE bị 403. Role của browser/preview không được tin cậy.

GET /api/vpn/auth/session trả:
```json
{
  "authenticated": true,
  "isAdmin": true,
  "username": "hoangan",
  "authenticationMode": "Portal",
  "temporaryLoginEnabled": false,
  "loginUrl": "login.html?returnTo=vpn-admin.html",
  "csrfToken": "<request-token>",
  "expiresAt": "<UTC ISO-8601>"
}
```

Cookie antiforgery HttpOnly/SameSite=Strict và Secure khi HTTPS. Mọi POST/DELETE VPN cần X-CSRF-Token từ session endpoint. POST /api/vpn/auth/logout cần CSRF, kết thúc phiên website hiện tại tại Node và chuyển Set-Cookie xóa session về browser. Cookie website cũ không dùng lại được sau logout.

Session website được kiểm tra tại Node/DB trên mỗi request VPN; không cache quyền ADMIN. Migration 070 tăng auth_version khi reset/đổi password, khóa hoặc đổi role; phiên cũ không có hiệu lực. Login mang epoch đã xác minh vào transaction cấp phiên để chặn race sau thu hồi. Tài khoản VPN vẫn dùng accounts.json/PBKDF2, không đồng bộ password scrypt của website.

POST /api/vpn/auth/login chỉ dành cho chế độ Temporary được cấu hình rõ ràng. Portal mode từ chối endpoint này; frontend chuyển tới login website bằng returnTo allowlist. Temporary session/cookie không cấp quyền trong Portal mode.

Nếu thay backend sau này, giữ IVpnAdminAuthorizer và authentication handler phía server; xác minh principal/permission bằng nguồn đáng tin cậy. PortalBackendClient chỉ gọi base URL HTTP loopback cố định trong cấu hình, không nhận remote URL từ browser. Header Host/X-Forwarded-Proto được gateway tạo lại, giữ kiểm tra Origin của Node; không forward header role hoặc actor giả từ browser.

## Lỗi

Request JSON tối đa 16 KiB. Lỗi VPN có dạng:
```json
{"error":{"code":"account_not_found","message":"Không tìm thấy tài khoản VPN.","correlationId":"<32 hex>"}}
```

Gateway sinh correlation ID và actor từ immutable user ID đã xác thực; chuyển qua header nội bộ với service token. Response có X-Correlation-ID, no-store. Không trả secret hoặc chi tiết exception nội bộ.

400 validation/CSRF/query; 401 chưa đăng nhập/phiên hết hạn; 403 không có quyền/HTTPS bắt buộc; 404 không tìm thấy; 409 trùng user/store lock/hết IP; 413 body quá lớn; 415 cần JSON; 429 giới hạn login; 502 xác thực control hoặc identity backend không hợp lệ; 503 backend/VPN offline/chưa cấu hình; 504 timeout. Không tự retry thao tác ghi khi mất kết nối vì thao tác có thể đã được áp dụng.

API nghiệp vụ Node tiếp tục dùng envelope {data:...}/{error:string}; adapter nghiệp vụ xử lý thêm lỗi gateway có error.message. Adapter VPN độc lập, không trộn DTO hoặc fallback mock.

## Endpoint nghiệp vụ VPN

| Method | Sau /api/vpn | Request | Response |
| --- | --- | --- | --- |
| GET | /accounts | — | 200 AccountInfo[] |
| POST | /accounts | {username,password,notes?,externalUserId?} | 201 AccountInfo |
| POST | /accounts/{username}/disable | rỗng | 200 AccountInfo, thu hồi mọi phiên |
| POST | /accounts/{username}/enable | rỗng | 200 AccountInfo, không tự nối lại |
| POST | /accounts/{username}/password | {password} | 204, thu hồi mọi phiên |
| DELETE | /accounts/{username} | — | 204, thu hồi mọi phiên |
| GET | /sessions | — | 200 SessionInfo[] |
| POST | /sessions/{sessionId}/disconnect | rỗng | 200 {revoked:boolean} |
| POST | /accounts/{username}/disconnect | rỗng | 200 {revoked:number} |
| GET | /logs | query bên dưới | 200 {items,page,pageSize,total} |
| GET | /overview | — | 200 {health,metrics,activeSessions,auditHealthy,sampleIntervalSeconds} |
| GET | /health | — | 200 health; 503 nếu runtime chưa sẵn sàng/heartbeat cũ |
| GET | /metrics | — | 200 MetricsSnapshot hoặc null trước mẫu đầu |
| GET | /alerts | — | 200 {configuration,items:AlertRecord[]} |

Username VPN: 1–32 ASCII letters/digits/underscore, phân biệt hoa/thường. Password 12–256 ký tự. Notes tối đa 300, externalUserId tối đa 100; không có ký tự điều khiển. externalUserId chỉ là tham chiếu, không tự đồng bộ hoặc thu hồi VPN khi sửa tài khoản website.

AccountInfo: username, enabled, createdAt, updatedAt, notes, externalUserId. Không trả password/hash/salt.

SessionInfo: sessionId (32 hex), username, sourceIp (IP nguồn TLS), vpnIp, connectedAt, durationSeconds, receivedBytes, sentBytes, closing.

Log query: from/to là ISO-8601 có timezone; username/eventType/outcome lọc chính xác; page mặc định 1, 1–10000; pageSize mặc định 50, tối đa 100. Mặc định 24 giờ, tối đa 31 ngày; mới nhất trước. Không nhận filename/path. AuditEvent: eventId,timestamp,eventType,username,sessionId,sourceIp,vpnIp,outcome,actor,correlationId,message. Event types gồm login, connected, disconnected, account-created/disabled/enabled/deleted, password-reset, admin-disconnect, admin-disconnect-all, connection-error, service-started/stopped/error, alert, watchdog.

Health: status (starting/running/stopped/faulted), startedAt, heartbeat, processId. MetricsSnapshot: sampledAt,vpnStatus,startedAt,uptimeSeconds,webStatus,activeSessions,processCpuPercent,processRamBytes,systemRamTotalBytes,systemRamAvailableBytes,diskTotalBytes,diskFreeBytes,receivedPayloadBytes,sentPayloadBytes,scope. Byte/giây/CPU %, trường không khả dụng là null. Traffic là IP payload, không gồm TLS/TCP overhead.

AlertRecord: alertId,timestamp,severity,eventType,message,deliveryStatus,attempts. Trả tối đa 100 cảnh báo mới nhất trong retention. configuration chỉ gồm enabled/provider/cooldownSeconds/retentionDays, không lộ webhook URL/token/chat ID.

Website GET /healthz kiểm tra backend Node/DB ở Portal mode, chỉ báo sức khỏe chứ không cấp quyền VPN. /control/store chỉ dùng cho CLI có token xác nhận store ID; gateway không mở endpoint này ra browser. Nginx standalone trả gateway_required cho /api/vpn/*.
