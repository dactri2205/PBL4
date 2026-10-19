import { api } from "../core/data-source.js";
import { isPreview, setSession, exitPreview } from "../core/demo-session.js";
import { esc, icon, logo, avatar } from "../core/ui.js";
import { initNotifications } from "./notifications.js";
export async function renderHeader(page) {
  const user = await api.getCurrentUser();
  const shell = document.getElementById("site-header");
  const links = [
    ["index", "Trang chủ", "home"],
    ["news", "Bản tin", "news"],
    ...(user
      ? [
          ["department", "Phòng ban", "building"],
          ["work", "Công việc", "work"],
        ]
      : []),
    ...(user?.role === "ADMIN" ? [["admin", "Quản trị", "shield"]] : []),
  ];
  shell.innerHTML = `${
    isPreview()
      ? `<div class="preview"><div class="page-container"><strong>Development Preview</strong><label for="preview-user" class="visually-hidden">Chọn người dùng mẫu</label><select id="preview-user"><option value="">Khách</option>${[
          ["minh", "Minh · Nhân viên IT · Alpha"],
          ["linh", "Linh · Nhân viên IT · Beta"],
          ["ha", "Hà · Nhân sự"],
          ["mai", "Mai · Chưa có công việc"],
          ["admin", "An · Quản trị viên"],
        ]
          .map(
            ([id, label]) =>
              `<option value="${id}" ${user?.id === id ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select><span>Dữ liệu giả lập · Chỉ lưu trong phiên</span><button id="exit-preview" class="secondary-button" style="padding:2px 8px;font-size:var(--font-size-caption)">Thoát xem thử</button></div></div>`
      : ""
  }<header class="header"><div class="page-container header-inner"><a href="index.html" class="brand" aria-label="An Việt — Trang chủ">${logo()}<span><strong>anviệt<span style="color:var(--accent)">.</span></strong><small>INTERNAL CONNECT</small></span></a><nav class="main-nav" id="primary-nav" aria-label="Điều hướng chính">${links.map(([id, label, ic]) => `<a href="${id === "index" ? "index" : id}.html" ${page === id ? 'aria-current="page"' : ""}>${icon(ic)}${label}</a>`).join("")}</nav><div class="header-actions">${user ? `<div class="dropdown-wrap"><button id="notification-toggle" class="icon-button" aria-label="Thông báo" aria-expanded="false" aria-controls="notification-panel" data-dropdown="notification-panel">${icon("bell")}</button><div class="dropdown-panel" id="notification-panel" hidden></div></div><div class="dropdown-wrap"><button class="profile-button" aria-expanded="false" aria-controls="profile-panel" data-dropdown="profile-panel">${avatar(user)}<span class="profile-name">${esc(user.name)}<small>${user.role === "ADMIN" ? "Quản trị viên" : "Thành viên"}</small></span>${icon("down")}</button><div class="dropdown-panel profile-panel" id="profile-panel" hidden><div class="p-2 muted small-text">${esc(user.username)} · Phiên xem thử</div><a href="department.html">Phòng ban của tôi</a><a href="work.html">Công việc của tôi</a><button id="sign-out">${icon("logout")} Kết thúc phiên mẫu</button></div></div>` : `<a href="login.html" class="primary-button">Đăng nhập ${icon("arrow")}</a>`}<button class="icon-button mobile-toggle" id="menu-toggle" aria-label="Mở menu" aria-controls="primary-nav" aria-expanded="false">${icon("menu")}</button></div></div></header>`;
  shell
    .querySelector("#preview-user")
    ?.addEventListener("change", (e) => setSession(e.target.value));
  shell.querySelector("#exit-preview")?.addEventListener("click", exitPreview);
  shell
    .querySelector("#sign-out")
    ?.addEventListener("click", () => setSession(null));
  const menu = shell.querySelector("#menu-toggle"),
    nav = shell.querySelector("#primary-nav");
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav.dataset.open = String(open);
  });
  const closeDropdowns = () =>
    shell.querySelectorAll("[data-dropdown]").forEach((b) => {
      shell.querySelector("#" + b.dataset.dropdown).hidden = true;
      b.setAttribute("aria-expanded", "false");
    });
  shell.querySelectorAll("[data-dropdown]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = shell.querySelector("#" + b.dataset.dropdown),
        open = p.hidden;
      closeDropdowns();
      p.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
    }),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-wrap")) closeDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const trigger = shell.querySelector(
        '[data-dropdown][aria-expanded="true"]',
      );
      closeDropdowns();
      if (trigger) trigger.focus();
      if (nav.dataset.open === "true") {
        nav.dataset.open = "false";
        menu.setAttribute("aria-expanded", "false");
        menu.focus();
      }
    }
  });
  await initNotifications(shell);
  return user;
}
