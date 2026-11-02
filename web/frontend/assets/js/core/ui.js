export function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const paths = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  news: "M5 3h14v18H5zM8 7h8M8 11h8M8 15h3M8 18h7",
  building: "M4 21V5h10v16M14 10h6v11M8 9h2M8 13h2M8 17h2M2 21h20",
  work: "M4 7h16a1 1 0 0 1 1 1v12H3V8a1 1 0 0 1 1-1ZM8 7V3h8v4M3 12h18M10 12v3h4v-3",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM8 12l3 3 5-6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  arrow: "M4 12h16M14 6l6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  left: "m15 5-7 7 7 7",
  down: "m6 9 6 6 6-6",
  close: "m6 6 12 12M18 6 6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 18h2",
  spark: "m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  check: "m5 12 4 4L19 6",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  edit: "m16 3 5 5L9 20l-6 1 1-6ZM13 6l5 5",
  plus: "M12 5v14M5 12h14",
  power: "M12 2v10M5 5a9 9 0 1 0 14 0",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  folder: "M3 5h7l2 3h9v13H3Z",
  logout: "M9 3H3v18h6M9 12h12m-5-5 5 5-5 5",
  reset: "M3 3v6h6M3 9a9 9 0 1 1 0 6",
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
}
export function logo() {
  return '<svg class="logo" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 29 18 5h8L13 29H5Z" fill="currentColor"/><path d="m20 20 7-13 9 22H20l4-8 4 8" stroke="currentColor" stroke-width="3"/><path d="M4 35h32" stroke="currentColor" stroke-width="2"/></svg>';
}
export function date(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value + "T12:00:00+07:00"));
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function overdue(task) {
  return task.status !== "Completed" && task.due < today();
}
export const statusLabels = {
  Pending: "Chờ thực hiện",
  "In Progress": "Đang thực hiện",
  Completed: "Hoàn thành",
  Active: "Hoạt động",
  Disabled: "Vô hiệu hóa",
};
export function badge(status) {
  const kind =
    {
      Pending: "",
      "In Progress": "info",
      Completed: "success",
      Active: "success",
      Disabled: "",
    }[status] || "";
  return `<span class="status-badge ${kind}">${esc(statusLabels[status] || status)}</span>`;
}
export function priority(value) {
  const label = { High: "Cao", Medium: "Trung bình", Low: "Thấp" };
  return `<span class="status-badge ${{ High: "error", Medium: "warning", Low: "" }[value] || ""}">${esc(label[value] || value)}</span>`;
}
export function avatar(user) {
  const initials = (user?.name || "?")
    .split(" ")
    .slice(-2)
    .map((x) => x[0])
    .join("");
  return `<span class="avatar">${user?.photo ? `<img src="assets/images/${esc(user.photo)}.jpg" alt="" loading="lazy">` : esc(initials)}</span>`;
}
export function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast-message";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 4000);
}
export function empty(title, description, action = "") {
  return `<div class="empty">${icon("lock")}<h1>${esc(title)}</h1><p>${esc(description)}</p>${action}</div>`;
}
export function searchInput(id, label) {
  return `<div class="search">${icon("search")}<label class="visually-hidden" for="${id}">${label}</label><input class="input" type="search" id="${id}" placeholder="${label}"></div>`;
}
export function heading(eyebrow, title, description, extra = "") {
  return `<div class="page-top"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${extra}</div>`;
}
