import { writeFileSync } from "node:fs";
const pages = {
  index: ["Trang chủ", "Kết nối hôm nay. Kiến tạo ngày mai."],
  login: ["Đăng nhập", "Đăng nhập cổng thông tin An Việt."],
  news: ["Bản tin", "Thông báo, hoạt động và chính sách An Việt."],
  department: ["Phòng ban", "Không gian phòng ban và đội ngũ An Việt."],
  work: ["Công việc", "Dự án và công việc được phân công."],
  admin: ["Quản trị", "Quản lý tài khoản người dùng mẫu."],
};
for (const [id, [title, description]] of Object.entries(pages))
  writeFileSync(
    `frontend/${id}.html`,
    `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#073544">
  <title>${title} · An Việt</title>
  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/vendor/bootstrap/bootstrap.min.css">
  ${["fonts", "tokens", "base", "layout", "components", "effects", "pages"].map((name) => `<link rel="stylesheet" href="assets/css/${name}.css">`).join("\n  ")}
</head>
<body data-page="${id}">
  <a class="skip" href="#main-content">Đến nội dung chính</a>
  <div id="site-header"></div>
  <main id="main-content" tabindex="-1"><p class="empty" role="status">Đang tải không gian An Việt…</p></main>
  <div id="site-footer"></div>
  <noscript><p class="page-container">Vui lòng bật JavaScript để sử dụng cổng thông tin.</p></noscript>
  <script src="assets/vendor/bootstrap/bootstrap.bundle.min.js" defer></script>
  <script type="module" src="assets/js/core/app.js"></script>
</body>
</html>
`,
  );
