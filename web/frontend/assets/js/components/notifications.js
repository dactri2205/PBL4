import { api } from "../core/data-source.js";
import { esc, date, icon } from "../core/ui.js";
import { openTask } from "./task-drawer.js";
export async function initNotifications(root) {
  const bell = root.querySelector("#notification-toggle");
  if (!bell) return;
  const panel = root.querySelector("#notification-panel");
  const paint = async () => {
    const items = await api.getNotifications();
    const count = items.filter((n) => !n.read).length;
    bell.setAttribute("aria-label", `Thông báo, ${count} chưa đọc`);
    bell.innerHTML = `${icon("bell")}${count ? `<span class="count">${count}</span>` : ""}`;
    panel.innerHTML = `<div class="dropdown-head"><strong>Thông báo của bạn</strong><button data-read-all>Đọc tất cả</button></div><div class="notification-list">${items.length ? items.map((n) => `<button class="notification ${n.read ? "" : "unread"}" data-notification="${esc(n.id)}">${n.read ? "" : '<span class="status-badge info">Chưa đọc</span> '}<span>${esc(n.title)}</span><small>${date(n.date)}</small></button>`).join("") : '<p class="p-3 muted">Bạn chưa có thông báo mới.</p>'}</div><div class="p-2 muted small-text">Dữ liệu mẫu trong phiên xem thử</div>`;
  };
  await paint();
  panel.addEventListener("click", async (e) => {
    if (e.target.closest("[data-read-all]")) {
      await api.markRead("all");
      await paint();
      return;
    }
    const b = e.target.closest("[data-notification]");
    if (!b) return;
    const n = (await api.getNotifications()).find(
      (n) => n.id === b.dataset.notification,
    );
    await api.markRead(n.id);
    await paint();
    if (n.taskId) {
      panel.hidden = true;
      bell.setAttribute("aria-expanded", "false");
      await openTask(n.taskId, () =>
        document.dispatchEvent(new Event("tasks-updated")),
      );
    }
  });
}
