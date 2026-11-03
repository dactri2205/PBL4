import { api } from "../core/data-source.js";
import { isPreview, setSession, exitPreview } from "../core/demo-session.js";
import { esc, icon, logo, avatar } from "../core/ui.js";
import { initNotifications } from "./notifications.js";
import { openModal } from "./modal.js";

export async function renderHeader(page) {
  const user = await api.getCurrentUser();
  const preview = isPreview();
  const shell = document.getElementById("site-header");
  const links = [
    ["index", "Trang chủ", "home"],
    ["news", "Bản tin", "news"],
    ...(user ? [["work", "Công việc", "work"]] : []),
    ...(user ? [["department", "Phòng ban", "building"]] : []),
    ...(user?.role === "ADMIN" ? [["admin", "Quản trị", "shield"]] : []),
  ];
  const notifications =
    user
      ? `<div class="dropdown-wrap"><button id="notification-toggle" class="icon-button" aria-label="Thông báo" aria-expanded="false" aria-controls="notification-panel" data-dropdown="notification-panel">${icon("bell")}</button><div class="dropdown-panel" id="notification-panel" hidden></div></div>`
      : "";
  const profile = user
    ? `<div class="dropdown-wrap"><button class="profile-button" aria-expanded="false" aria-controls="profile-panel" data-dropdown="profile-panel">${avatar(user)}<span class="profile-name">${esc(user.name)}<small>${user.role === "ADMIN" ? "Quản trị viên" : "Thành viên"}</small></span>${icon("down")}</button><div class="dropdown-panel profile-panel" id="profile-panel" hidden><div class="p-2 muted small-text">${esc(user.username)} · ${preview ? "Phiên xem thử" : "Phiên đăng nhập"}</div><a href="department.html">Phòng ban của tôi</a><a href="work.html">Công việc của tôi</a>${user.role === "ADMIN" ? '<a href="admin.html">Quản lý người dùng</a>' : ""}${preview ? "" : '<button id="change-password">Đổi mật khẩu</button>'}<button id="sign-out">${icon("logout")} ${preview ? "Kết thúc phiên mẫu" : "Đăng xuất"}</button></div></div>`
    : `<a href="login.html" class="primary-button">Đăng nhập ${icon("arrow")}</a>`;

  shell.innerHTML = `${
    preview
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
          .join("")}</select><span>Dữ liệu giả lập · Chỉ lưu trong phiên</span><button id="exit-preview" class="secondary-button" style="padding:2px 8px;font-size:var(--font-size-caption)">Thoát xem thử</button></div></div>`
      : ""
  }<header class="header"><div class="page-container header-inner"><a href="index.html" class="brand" aria-label="An Việt — Trang chủ">${logo()}<span><strong>anviệt<span style="color:var(--accent)">.</span></strong><small>INTERNAL CONNECT</small></span></a><nav class="main-nav" id="primary-nav" aria-label="Điều hướng chính">${links.map(([id, label, ic]) => `<a href="${id === "index" ? "index" : id}.html" ${page === id ? 'aria-current="page"' : ""}>${icon(ic)}${label}</a>`).join("")}</nav><div class="header-actions">${notifications}${profile}<button class="icon-button mobile-toggle" id="menu-toggle" aria-label="Mở menu" aria-controls="primary-nav" aria-expanded="false">${icon("menu")}</button></div></div></header>`;

  shell
    .querySelector("#preview-user")
    ?.addEventListener("change", (event) => setSession(event.target.value));
  shell.querySelector("#exit-preview")?.addEventListener("click", exitPreview);
  shell.querySelector("#sign-out")?.addEventListener("click", async () => {
    if (preview) {
      setSession(null);
      return;
    }
    try {
      await api.logout();
      location.href = "index.html";
    } catch (error) {
      window.alert(error.message || "Không thể đăng xuất. Hãy thử lại.");
    }
  });

  const menu = shell.querySelector("#menu-toggle");
  const nav = shell.querySelector("#primary-nav");
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    nav.dataset.open = String(open);
  });
  const closeDropdowns = () =>
    shell.querySelectorAll("[data-dropdown]").forEach((button) => {
      shell.querySelector("#" + button.dataset.dropdown).hidden = true;
      button.setAttribute("aria-expanded", "false");
    });
  shell.querySelector("#change-password")?.addEventListener("click", () => {
    closeDropdowns();
    const dialog = openModal({
      title: "Đổi mật khẩu",
      body: `<form id="password-change-form"><div class="field"><label for="current-password">Mật khẩu hiện tại</label><input class="input" id="current-password" name="currentPassword" type="password" autocomplete="current-password" maxlength="1024" required></div><div class="field"><label for="new-password">Mật khẩu mới</label><input class="input" id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required></div><div class="field"><label for="confirm-password">Nhập lại mật khẩu mới</label><input class="input" id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="1024" required></div><p class="notice">Mật khẩu cần ít nhất 12 ký tự. Sau khi đổi, tất cả phiên đăng nhập sẽ kết thúc.</p><p class="feedback" id="password-change-feedback" role="status" aria-live="polite"></p><div class="dialog-actions"><button type="button" class="secondary-button" data-cancel>Hủy</button><button type="submit" class="primary-button">Đổi mật khẩu</button></div></form>`,
    });
    const form = dialog.querySelector("#password-change-form");
    dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const feedback = dialog.querySelector("#password-change-feedback");
      if (values.newPassword !== values.confirmPassword) {
        feedback.textContent = "Mật khẩu nhập lại chưa khớp.";
        dialog.querySelector("#confirm-password").focus();
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await api.changePassword(values.currentPassword, values.newPassword);
        location.href = "login.html?password_changed=1";
      } catch (error) {
        feedback.textContent = error.message || "Không thể đổi mật khẩu.";
      } finally {
        submit.disabled = false;
      }
    });
  });
  shell.querySelectorAll("[data-dropdown]").forEach((button) =>
    button.addEventListener("click", () => {
      const panel = shell.querySelector("#" + button.dataset.dropdown);
      const open = panel.hidden;
      closeDropdowns();
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    }),
  );
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".dropdown-wrap")) closeDropdowns();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const trigger = shell.querySelector('[data-dropdown][aria-expanded="true"]');
      closeDropdowns();
      if (trigger) trigger.focus();
      if (nav.dataset.open === "true") {
        nav.dataset.open = "false";
        menu.setAttribute("aria-expanded", "false");
        menu.focus();
      }
    }
  });
  if (user) await initNotifications(shell);
  return user;
}
