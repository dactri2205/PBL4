import { renderHeader } from "../components/header.js";
import { empty, logo } from "./ui.js";
const page = document.body.dataset.page;
const main = document.getElementById("main-content");
try {
  const user = await renderHeader(page);
  document.getElementById("site-footer").innerHTML =
    `<footer class="footer"><div class="page-container"><a href="index.html" class="brand">${logo()}<strong>anviệt.</strong></a><span>Kết nối con người. Đồng hành phát triển.</span><span>© ${new Date().getFullYear()} An Việt</span></div></footer>`;
  if (["department", "work", "admin"].includes(page) && !user) {
    main.className = "page-container page";
    main.innerHTML = empty(
      "Không gian dành cho thành viên",
      "Đăng nhập để truy cập thông tin cá nhân khi hệ thống được kết nối.",
      '<a class="primary-button" href="login.html">Đến trang đăng nhập</a>',
    );
  } else if (page === "admin" && user.role !== "ADMIN") {
    main.className = "page-container page";
    main.innerHTML = empty(
      "Khu vực quản trị",
      "Tài khoản mẫu hiện tại không có giao diện quản trị.",
      '<a class="secondary-button" href="work.html">Về công việc của tôi</a>',
    );
  } else {
    const modules = {
      index: "home",
      login: "login",
      news: "news",
      department: "department",
      work: "work",
      admin: "admin",
    };
    const { render } = await import(`../pages/${modules[page]}.js`);
    await render(main, user);
  }
  document.documentElement.dataset.ready = "true";
} catch (error) {
  console.error(error);
  main.innerHTML = empty(
    "Chưa thể hiển thị nội dung",
    "Vui lòng tải lại trang hoặc xóa dữ liệu phiên xem thử nếu cần.",
  );
  document.documentElement.dataset.ready = "error";
}
