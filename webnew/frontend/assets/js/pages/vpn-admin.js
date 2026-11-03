import { vpnApi } from "../services/vpn-api.js";
import { esc, icon, logo, heading, toast } from "../core/ui.js";
import { openModal } from "../components/modal.js";

const root = document.getElementById("main-content");
root.classList.add("vpn-page");
document.getElementById("site-header").innerHTML = `<header class="header"><div class="page-container header-inner"><a href="index.html" class="brand">${logo()}<strong>anviệt.</strong></a><nav class="main-nav" aria-label="Điều hướng VPN"><a href="index.html">${icon("home")}Trang chủ</a><a href="vpn-admin.html" aria-current="page">${icon("shield")}Quản trị VPN</a></nav><a class="secondary-button" href="login.html">Cổng nhân viên</a></div></header>`;
document.getElementById("site-footer").innerHTML = '<footer class="footer"><div class="page-container">An Việt · MiniVPN · Quyền quản trị được xác minh bởi backend website. Tài khoản VPN và dữ liệu xem thử là riêng biệt.</div></footer>';
const life = new AbortController();
let timer, busy = false, updating = false, accounts = [], sessions = [], page = 1, logFilters = {};
let currentTab = "overview";
let authenticationMode = "Portal";
const localTime = (value) => value ? new Date(value).toLocaleString("vi-VN") : "Không khả dụng";
const duration = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 3600)} giờ ${Math.floor(seconds / 60) % 60} phút ${Math.floor(seconds) % 60} giây` : "Không khả dụng";
const size = (bytes) => bytes == null ? "Không khả dụng" : `${(bytes / 1048576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MiB`;
const percent = (value) => value == null ? "Không khả dụng" : `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const badge = (text, kind = "") => `<span class="status-badge ${kind}">${esc(text)}</span>`;
const statusLabels = { running: "Đang chạy", starting: "Đang khởi động", stopped: "Đã dừng", faulted: "Lỗi", online: "Hoạt động", offline: "Mất kết nối" };
const opts = () => ({ signal: life.signal });
function banner(message, state = "error") {
  const el = root.querySelector("#vpn-status");
  if (el) { el.textContent = message; el.dataset.state = state; el.hidden = false; }
}
function errorMessage(error) { return `${error.message || "Không thể tải dữ liệu."}${error.correlationId ? ` · Mã tra cứu: ${error.correlationId}` : ""}`; }
function failure(error) {
  if (life.signal.aborted) return;
  if (error.status === 401) { clearTimeout(timer); showLogin("Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại."); return; }
  if (error.status === 403) { clearTimeout(timer); showDenied(errorMessage(error)); return; }
  banner(errorMessage(error));
  root.querySelector("#vpn-overview")?.classList.add("vpn-stale");
  const health = root.querySelector("#vpn-live-state");
  if (health) { health.textContent = "Mất kết nối / dữ liệu cũ"; health.className = "status-badge error"; }
}
function showDenied(message) {
  root.innerHTML = `${heading("Quyền truy cập", "Không thể truy cập quản trị VPN", message)}<a href="vpn-admin.html" class="secondary-button">Kiểm tra lại phiên</a><p class="notice mt-3">Quyền ADMIN trong Development Preview không cấp quyền thao tác VPN thật.</p>`;
  document.documentElement.dataset.ready = "true";
}
function showLogin(message = "") {
  if (authenticationMode === "Portal") {
    root.innerHTML = `${heading("MiniVPN", "Đăng nhập website để quản trị VPN", "Tài khoản ADMIN thật của website có quyền quản trị VPN. Không cần tài khoản admin VPN thứ hai.")}<section class="surface-card vpn-login"><p role="status">${esc(message || "Bạn chưa đăng nhập hoặc phiên website đã hết hạn.")}</p><a id="vpn-portal-login" class="primary-button" href="login.html?real=1&amp;returnTo=vpn-admin.html">Đăng nhập website ${icon("arrow")}</a></section><p class="notice">Tài khoản EMPLOYEE và ADMIN trong Development Preview không được cấp quyền quản trị VPN.</p>`;
    document.documentElement.dataset.ready = "true";
    return;
  }
  root.innerHTML = `${heading("MiniVPN", "Đăng nhập quản trị VPN", "Phiên được xác thực bởi máy chủ, tách biệt với tài khoản VPN và cổng nhân viên.")}<section class="surface-card vpn-login"><form id="vpn-login"><div class="field"><label for="vpn-username">Tên quản trị</label><input class="input" id="vpn-username" name="username" autocomplete="username" maxlength="32" required></div><div class="field"><label for="vpn-password">Mật khẩu quản trị</label><input class="input" id="vpn-password" name="password" type="password" autocomplete="current-password" maxlength="256" required></div><p id="vpn-login-feedback" role="status">${esc(message)}</p><button class="primary-button" type="submit">Đăng nhập quản trị</button></form></section><p class="notice">Cơ chế đăng nhập tạm phải được bật trên server. Không sử dụng tài khoản VPN hoặc tài khoản mẫu của website.</p>`;
  root.querySelector("#vpn-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true; const button = event.target.querySelector("button"); button.disabled = true;
    const password = root.querySelector("#vpn-password");
    try {
      await vpnApi.session(opts());
      const session = await vpnApi.login(root.querySelector("#vpn-username").value, password.value, life.signal);
      if (!session.isAdmin) { showDenied("Phiên đã xác thực nhưng không có quyền VPN_ADMIN."); return; }
      busy = false;
      await showDashboard(session);
    } catch (error) { const feedback = root.querySelector("#vpn-login-feedback"); if (feedback) feedback.textContent = errorMessage(error); }
    finally { password.value = ""; button.disabled = false; busy = false; }
  });
  document.documentElement.dataset.ready = "true";
}
function table(id, columns, label) {
  return `<div class="table-scroll-region" role="region" tabindex="0" aria-label="${label}"><table class="data-table vpn-table"><thead><tr>${columns.map(c => `<th scope="col">${c}</th>`).join("")}</tr></thead><tbody id="${id}"><tr><td colspan="${columns.length}" role="status">Đang tải…</td></tr></tbody></table></div>`;
}
async function showDashboard(session) {
  root.innerHTML = `${heading("Vận hành mạng nội bộ", "Quản trị VPN", `Quản trị: ${session.username} · Hết hạn: ${localTime(session.expiresAt)}`, '<div class="vpn-actions"><button class="secondary-button" id="vpn-refresh">Làm mới</button><button class="secondary-button" id="vpn-logout">Đăng xuất</button></div>')}<div id="vpn-status" class="vpn-banner" role="status" data-state="loading">Đang tải dữ liệu thực từ VPN server…</div><p class="vpn-note">Tài khoản VPN khác tài khoản website. Nếu khóa hoặc ngắt tài khoản VPN đang dùng, bạn có thể mất kết nối tới dashboard.</p><nav class="vpn-tabs" aria-label="Chức năng quản trị VPN">${[["overview", "Tổng quan"], ["accounts", "Tài khoản"], ["sessions", "Phiên kết nối"], ["logs", "Nhật ký"], ["alerts", "Cảnh báo"]].map(([id, label]) => `<button class="secondary-button" data-tab="${id}" aria-pressed="${id === currentTab}">${label}</button>`).join("")}</nav>
  <section id="vpn-overview" data-panel="overview"><div class="vpn-section-head"><h2>Trạng thái hệ thống</h2><span class="status-badge" id="vpn-live-state">Đang kiểm tra</span></div><div id="vpn-metrics" class="vpn-grid"></div><p class="vpn-note" id="vpn-sample"></p><p class="vpn-note">CPU tính theo toàn bộ CPU logic của máy; RAM process là working set. Lưu lượng tính byte gói IP hợp lệ qua tunnel, không gồm overhead TLS/TCP. Giá trị chưa đo được hiển thị “Không khả dụng”.</p></section>
  <section data-panel="accounts" hidden><div class="vpn-section-head"><h2>Tài khoản VPN</h2><button id="vpn-create" class="primary-button">${icon("plus")}Tạo tài khoản</button></div><div class="vpn-filters"><div class="field"><label for="vpn-search">Tìm tài khoản</label><input id="vpn-search" class="input" type="search" maxlength="32"></div><div class="field"><label for="vpn-filter">Trạng thái</label><select id="vpn-filter" class="select"><option value="">Tất cả</option><option value="enabled">Đang mở</option><option value="disabled">Đã khóa</option></select></div></div>${table("vpn-account-rows", ["Tài khoản", "Trạng thái", "Tạo / cập nhật", "Ghi chú / liên kết", "Thao tác"], "Tài khoản VPN, cuộn ngang trên màn hình nhỏ")}</section>
  <section data-panel="sessions" hidden><h2>Phiên kết nối thực</h2>${table("vpn-session-rows", ["Tài khoản / phiên", "IP nguồn", "IP VPN", "Kết nối / thời lượng", "Nhận / gửi", "Thao tác"], "Phiên VPN")}</section>
  <section data-panel="logs" hidden><h2>Nhật ký vận hành</h2><form class="vpn-filters" id="vpn-log-filters"><div class="field"><label for="log-from">Từ thời gian địa phương</label><input id="log-from" class="input" type="datetime-local" name="from"></div><div class="field"><label for="log-to">Đến thời gian địa phương</label><input id="log-to" class="input" type="datetime-local" name="to"></div><div class="field"><label for="log-user">Tài khoản</label><input id="log-user" class="input" name="username" maxlength="32"></div><div class="field"><label for="log-type">Loại sự kiện</label><select id="log-type" class="select" name="eventType"><option value="">Tất cả</option>${["login", "connected", "disconnected", "account-created", "account-disabled", "account-enabled", "password-reset", "account-deleted", "admin-disconnect", "admin-disconnect-all", "service-error", "alert"].map(x => `<option>${x}</option>`).join("")}</select></div><div class="field"><label for="log-outcome">Kết quả</label><select id="log-outcome" class="select" name="outcome"><option value="">Tất cả</option><option value="success">Thành công</option><option value="failure">Thất bại</option><option value="sent">Đã gửi cảnh báo</option><option value="failed">Gửi thất bại</option></select></div><button class="secondary-button" type="submit">Lọc nhật ký</button></form><p class="vpn-note">Mặc định 24 giờ gần nhất, tối đa 31 ngày mỗi truy vấn. Thời gian hiển thị theo múi giờ trình duyệt.</p>${table("vpn-log-rows", ["Thời gian / sự kiện", "Tài khoản / phiên", "IP nguồn / VPN", "Kết quả", "Tác nhân / mã tra cứu", "Nội dung"], "Nhật ký VPN")}<div class="vpn-section-head mt-3"><button class="secondary-button" id="vpn-log-prev">Trang trước</button><span id="vpn-log-page" aria-live="polite"></span><button class="secondary-button" id="vpn-log-next">Trang sau</button></div></section>
  <section data-panel="alerts" hidden><h2>Cảnh báo và trạng thái gửi</h2><p class="notice" id="vpn-alert-config">Đang tải cấu hình đã che bí mật…</p>${table("vpn-alert-rows", ["Thời gian", "Mức độ", "Sự kiện", "Nội dung", "Kết quả gửi / số lần thử"], "Lịch sử cảnh báo VPN")}</section>`;
  root.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    currentTab = b.dataset.tab;
    root.querySelectorAll("[data-tab]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === b)));
    root.querySelectorAll("[data-panel]").forEach(panel => panel.hidden = panel.dataset.panel !== currentTab);
  }));
  root.querySelector("#vpn-search").addEventListener("input", paintAccounts);
  root.querySelector("#vpn-filter").addEventListener("change", paintAccounts);
  root.querySelector("#vpn-create").addEventListener("click", () => editAccount());
  root.querySelector("#vpn-refresh").addEventListener("click", () => refreshAll().catch(failure));
  root.querySelector("#vpn-logout").addEventListener("click", () => mutate(async () => {
    await vpnApi.logout(life.signal); clearTimeout(timer); showLogin("Đã kết thúc phiên quản trị.");
  }, false));
  root.querySelector("#vpn-account-rows").addEventListener("click", accountAction);
  root.querySelector("#vpn-session-rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-session]"); if (!b || busy) return;
    confirmAction("Ngắt phiên VPN?", "Tunnel và các kết nối relay của phiên này sẽ đóng.", () => vpnApi.disconnectSession(b.dataset.session, life.signal));
  });
  root.querySelector("#vpn-log-filters").addEventListener("submit", (e) => {
    e.preventDefault(); logFilters = Object.fromEntries(new FormData(e.target));
    for (const field of ["from", "to"]) if (logFilters[field]) logFilters[field] = new Date(logFilters[field]).toISOString();
    page = 1; loadLogs().catch(failure);
  });
  root.querySelector("#vpn-log-prev").addEventListener("click", () => { if (page > 1) { page--; loadLogs().catch(failure); } });
  root.querySelector("#vpn-log-next").addEventListener("click", () => { page++; loadLogs().catch(failure); });
  try { await refreshAll(); } catch (error) { failure(error); }
  schedule(); document.documentElement.dataset.ready = "true";
}
function paintOverview(data) {
  const metrics = data.metrics;
  const maximumAge = ((data.sampleIntervalSeconds || 10) * 3 + 5) * 1000;
  const stale = !metrics || Date.now() - new Date(metrics.sampledAt).getTime() > maximumAge;
  const live = data.health.status === "running" && !stale;
  const state = root.querySelector("#vpn-live-state");
  state.textContent = live ? "Đang kết nối VPN server" : "VPN chưa sẵn sàng / mẫu đã cũ";
  state.className = `status-badge ${live ? "success" : "error"}`;
  root.querySelector("#vpn-overview").classList.toggle("vpn-stale", !live);
  const values = [
    ["VPN", statusLabels[data.health.status] || data.health.status, "Trạng thái runtime"],
    ["Website", statusLabels[metrics?.webStatus] || "Không khả dụng", "HTTP health check từ máy chủ"],
    ["Uptime VPN", duration(metrics?.uptimeSeconds), "Từ lúc khởi động tiến trình"],
    ["Phiên đang hoạt động", data.activeSessions, "Không gồm phiên đang đóng"],
    ["CPU VPN", percent(metrics?.processCpuPercent), "Phần trăm CPU logic khả dụng"],
    ["RAM VPN", size(metrics?.processRamBytes), "Working set của process"],
    ["RAM hệ thống còn trống", size(metrics?.systemRamAvailableBytes), `Tổng: ${size(metrics?.systemRamTotalBytes)}`],
    ["Ổ đĩa còn trống", size(metrics?.diskFreeBytes), `Volume dữ liệu · Tổng: ${size(metrics?.diskTotalBytes)}`],
    ["Tunnel nhận", size(metrics?.receivedPayloadBytes), "Gói IP client → server"],
    ["Tunnel gửi", size(metrics?.sentPayloadBytes), "Gói IP server → client"],
  ];
  root.querySelector("#vpn-metrics").innerHTML = values.map(([label, value, note]) => `<dl class="surface-card vpn-metric"><dt>${esc(label)}</dt><dd>${esc(value)}</dd><small>${esc(note)}</small></dl>`).join("");
  root.querySelector("#vpn-sample").textContent = `Lấy mẫu: ${localTime(metrics?.sampledAt)} · Dashboard kiểm tra lại mỗi 10 giây khi tab đang mở.`;
  if (!live) banner("VPN chưa sẵn sàng hoặc dữ liệu metrics đã cũ.");
  if (data.auditHealthy === false) banner("Kho nhật ký không ghi được dữ liệu. Kiểm tra dung lượng ổ đĩa và quyền tại server.");
}
function paintAccounts() {
  const query = root.querySelector("#vpn-search").value.toLowerCase(), state = root.querySelector("#vpn-filter").value;
  const list = accounts.filter(a => a.username.toLowerCase().includes(query) && (!state || a.enabled === (state === "enabled")));
  root.querySelector("#vpn-account-rows").innerHTML = list.length ? list.map(a => `<tr><td><strong>${esc(a.username)}</strong></td><td>${badge(a.enabled ? "Đang mở" : "Đã khóa", a.enabled ? "success" : "warning")}</td><td>${esc(localTime(a.createdAt))}<br><small>${esc(localTime(a.updatedAt))}</small></td><td>${esc(a.notes || "—")}<br><small>${esc(a.externalUserId || "Chưa liên kết")}</small></td><td><div class="vpn-actions">${[[a.enabled ? "disable" : "enable", a.enabled ? "Khóa" : "Mở khóa"], ["password", "Reset mật khẩu"], ["disconnect", "Ngắt mọi phiên"], ["delete", "Xóa"]].map(([action, label]) => `<button class="secondary-button" data-account="${esc(a.username)}" data-action="${action}">${label}</button>`).join("")}</div></td></tr>`).join("") : '<tr><td colspan="5" class="empty">Không có tài khoản phù hợp.</td></tr>';
  if (busy) root.querySelectorAll("[data-account]").forEach(button => button.disabled = true);
}
function paintSessions() {
  root.querySelector("#vpn-session-rows").innerHTML = sessions.length ? sessions.map(s => `<tr><td><strong>${esc(s.username)}</strong><br><small>${esc(s.sessionId)}</small></td><td>${esc(s.sourceIp)}</td><td>${esc(s.vpnIp)}</td><td>${esc(localTime(s.connectedAt))}<br><small>${esc(duration(s.durationSeconds))}</small></td><td>${esc(size(s.receivedBytes))} / ${esc(size(s.sentBytes))}</td><td>${s.closing ? badge("Đang đóng", "warning") : `<button class="secondary-button" data-session="${esc(s.sessionId)}">Ngắt phiên</button>`}</td></tr>`).join("") : '<tr><td colspan="6" class="empty">Không có phiên kết nối.</td></tr>';
  if (busy) root.querySelectorAll("[data-session]").forEach(button => button.disabled = true);
}
async function loadLogs() {
  const data = await vpnApi.logs({ ...logFilters, page, pageSize: 25 }, opts());
  if (life.signal.aborted || !root.querySelector("#vpn-log-rows")) return;
  root.querySelector("#vpn-log-rows").innerHTML = data.items.length ? data.items.map(e => `<tr><td>${esc(localTime(e.timestamp))}<br><small>${esc(e.eventType)}</small></td><td>${esc(e.username || "—")}<br><small>${esc(e.sessionId)}</small></td><td>${esc(e.sourceIp || "—")}<br>${esc(e.vpnIp || "—")}</td><td>${badge(e.outcome, e.outcome === "success" ? "success" : e.outcome === "failure" ? "error" : "")}</td><td>${esc(e.actor)}<br><small>${esc(e.correlationId)}</small></td><td class="vpn-log-message">${esc(e.message)}</td></tr>`).join("") : '<tr><td colspan="6" class="empty">Không có nhật ký trong bộ lọc này.</td></tr>';
  root.querySelector("#vpn-log-page").textContent = `Trang ${data.page} / ${Math.max(1, Math.ceil(data.total / data.pageSize))} · ${data.total} sự kiện`;
  root.querySelector("#vpn-log-prev").disabled = page <= 1;
  root.querySelector("#vpn-log-next").disabled = page * data.pageSize >= data.total;
}
function paintAlerts(data) {
  const config = data.configuration;
  root.querySelector("#vpn-alert-config").textContent = config.enabled ? `Đang bật ${config.provider} · Cooldown ${config.cooldownSeconds} giây · Lưu ${config.retentionDays} ngày. Bí mật chỉ ở server.` : "Gửi cảnh báo đang tắt. Lịch sử vẫn ghi nhận các sự kiện phát hiện được; cấu hình provider tại server để bật gửi.";
  const labels = { sent: "Đã gửi", failed: "Gửi thất bại", disabled: "Chưa bật gửi", pending: "Chờ gửi" };
  root.querySelector("#vpn-alert-rows").innerHTML = data.items.length ? data.items.map(a => `<tr><td>${esc(localTime(a.timestamp))}</td><td>${badge(a.severity === "critical" ? "Nghiêm trọng" : "Cảnh báo", a.severity === "critical" ? "error" : "warning")}</td><td>${esc(a.eventType)}</td><td class="vpn-log-message">${esc(a.message)}</td><td>${esc(labels[a.deliveryStatus] || a.deliveryStatus)} · ${esc(a.attempts)}</td></tr>`).join("") : '<tr><td colspan="5" class="empty">Chưa có cảnh báo.</td></tr>';
}
async function refreshAll() {
  if (updating) return;
  updating = true; banner("Đang tải dữ liệu thực…", "loading");
  try {
    const [overview, users, connections, alerts] = await Promise.all([vpnApi.overview(opts()), vpnApi.accounts(opts()), vpnApi.sessions(opts()), vpnApi.alerts(opts())]);
    if (life.signal.aborted || !root.querySelector("#vpn-metrics")) return;
    accounts = users; sessions = connections;
    root.querySelector("#vpn-status").hidden = true;
    paintOverview(overview); paintAccounts(); paintSessions(); paintAlerts(alerts);
    await loadLogs();
  } finally { updating = false; }
}
function schedule() {
  clearTimeout(timer);
  if (life.signal.aborted || !root.querySelector("#vpn-metrics")) return;
  timer = setTimeout(async () => {
    if (!document.hidden && !busy && !updating) {
      try {
        const [overview, connections] = await Promise.all([vpnApi.overview(opts()), vpnApi.sessions(opts())]);
        if (!root.querySelector("#vpn-metrics")) return;
        root.querySelector("#vpn-status").hidden = true; sessions = connections;
        paintOverview(overview); paintSessions();
        if (currentTab === "alerts") paintAlerts(await vpnApi.alerts(opts()));
      } catch (error) { failure(error); }
    }
    schedule();
  }, 10000);
}
async function mutate(action, refresh = true) {
  if (busy) return;
  busy = true;
  const buttons = [...root.querySelectorAll("button")]; const previous = buttons.map(b => b.disabled);
  buttons.forEach(b => b.disabled = true);
  try {
    await action();
    if (refresh) { toast("Máy chủ đã xác nhận thao tác."); await refreshAll(); }
  } catch (error) { failure(error); }
  finally {
    busy = false;
    buttons.forEach((b, i) => { if (b.isConnected) b.disabled = previous[i]; });
    root.querySelectorAll("[data-account], [data-session]").forEach(button => button.disabled = false);
  }
}
function confirmAction(title, message, action) {
  const dialog = openModal({ title, body: `<p>${esc(message)}</p><p class="notice">Nếu đây là tài khoản/phiên VPN bạn đang dùng, thao tác có thể làm mất kết nối dashboard. Tài khoản đăng nhập quản trị website là tài khoản riêng.</p><p role="status" data-feedback></p><div class="dialog-actions"><button class="secondary-button" data-cancel>Hủy</button><button class="primary-button" data-confirm>Xác nhận</button></div>` });
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.querySelector("[data-confirm]").onclick = () => {
    if (busy) return;
    const buttons = [...dialog.querySelectorAll("button")]; buttons.forEach(b => b.disabled = true);
    mutate(async () => {
      try { await action(); dialog.close(); }
      catch (error) { dialog.querySelector("[data-feedback]").textContent = errorMessage(error); throw error; }
      finally { buttons.forEach(b => b.disabled = false); }
    });
  };
}
function accountAction(event) {
  const button = event.target.closest("[data-account]"); if (!button || busy) return;
  const username = button.dataset.account, action = button.dataset.action;
  if (action === "password") { editAccount(username); return; }
  if (action === "enable") { mutate(() => vpnApi.setEnabled(username, true, life.signal)); return; }
  const actions = {
    disable: ["Khóa tài khoản VPN?", "Chặn đăng nhập mới và đóng mọi phiên hiện tại.", () => vpnApi.setEnabled(username, false, life.signal)],
    delete: ["Xóa tài khoản VPN?", "Tài khoản sẽ bị xóa và mọi phiên hiện tại sẽ đóng.", () => vpnApi.deleteAccount(username, life.signal)],
    disconnect: ["Ngắt mọi phiên của tài khoản?", "Các phiên hiện tại sẽ đóng; tài khoản còn mở vẫn có thể đăng nhập lại.", () => vpnApi.disconnectUser(username, life.signal)],
  };
  const [title, message, call] = actions[action]; confirmAction(title, `${username}: ${message}`, call);
}
function editAccount(username = null) {
  const dialog = openModal({ title: username ? `Reset mật khẩu VPN: ${username}` : "Tạo tài khoản VPN", body: `<form id="vpn-account-form">${!username ? '<div class="field"><label for="new-vpn-user">Tên tài khoản VPN</label><input id="new-vpn-user" class="input" name="username" pattern="[A-Za-z0-9_]{1,32}" maxlength="32" autocomplete="off" required></div>' : '<p class="notice">Reset mật khẩu sẽ đóng mọi phiên của tài khoản này. Nếu đây là VPN bạn đang dùng, dashboard có thể mất kết nối.</p>'}<div class="field"><label for="new-vpn-password">${username ? "Mật khẩu mới" : "Mật khẩu VPN"} (12–256 ký tự)</label><input id="new-vpn-password" class="input" type="password" name="password" minlength="12" maxlength="256" autocomplete="new-password" required></div>${!username ? '<div class="field"><label for="new-vpn-notes">Ghi chú</label><input id="new-vpn-notes" class="input" name="notes" maxlength="300"></div><div class="field"><label for="new-vpn-reference">externalUserId (tùy chọn)</label><input id="new-vpn-reference" class="input" name="externalUserId" maxlength="100"></div>' : '<label><input type="checkbox" required> Tôi xác nhận đổi mật khẩu và ngắt mọi phiên hiện tại.</label>'}<p role="status" data-feedback></p><div class="dialog-actions"><button class="secondary-button" type="button" data-cancel>Hủy</button><button class="primary-button" type="submit">${username ? "Xác nhận reset" : "Tạo tài khoản"}</button></div></form>` });
  const password = dialog.querySelector("#new-vpn-password");
  dialog.addEventListener("close", () => password.value = "", { once: true });
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault(); if (busy) return;
    const values = Object.fromEntries(new FormData(event.target));
    const buttons = [...dialog.querySelectorAll("button")]; buttons.forEach(b => b.disabled = true);
    mutate(async () => {
      try {
        if (username) await vpnApi.resetPassword(username, password.value, life.signal);
        else await vpnApi.createAccount(values, life.signal);
        dialog.close();
      } catch (error) { dialog.querySelector("[data-feedback]").textContent = errorMessage(error); throw error; }
      finally { password.value = ""; values.password = ""; buttons.forEach(b => b.disabled = false); }
    });
  };
}
window.addEventListener("pagehide", () => { clearTimeout(timer); life.abort(); }, { once: true });
window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    root.querySelector("#vpn-overview")?.classList.add("vpn-stale");
    const health = root.querySelector("#vpn-live-state"); if (health) { health.textContent = "Tạm dừng cập nhật"; health.className = "status-badge warning"; }
  } else if (root.querySelector("#vpn-metrics")) refreshAll().catch(failure);
});
try {
  const session = await vpnApi.session(opts());
  authenticationMode = session.authenticationMode || "Portal";
  if (!session.authenticated) showLogin(authenticationMode === "Temporary" && !session.temporaryLoginEnabled ? "Đăng nhập tạm chưa được bật trên server." : "");
  else if (!session.isAdmin) showDenied("Bạn đã đăng nhập nhưng không có quyền quản trị VPN.");
  else await showDashboard(session);
} catch (error) {
  showDenied(errorMessage(error));
}
