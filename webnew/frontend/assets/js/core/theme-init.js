// Chạy đồng bộ trong <head> để áp dụng giao diện trước khi trang hiển thị (tránh nháy trắng).
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("anviet-theme");
  } catch (error) {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.setAttribute("data-bs-theme", theme);
})();
