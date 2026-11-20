const STORAGE_KEY = "anviet-theme";

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.setAttribute("data-bs-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // Trình duyệt chặn lưu trữ: vẫn đổi giao diện cho phiên hiện tại.
  }
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
