import { esc, icon } from "../core/ui.js";
import { api } from "../core/data-source.js";
import { isPreview } from "../core/demo-session.js";
import { loginReturnTarget } from "../core/login-return.js";
export async function render(root, user) {
  const destination = loginReturnTarget(location.search);
  root.className = "login-page";
  if (user) {
    if (!isPreview() && destination !== "index.html") { location.replace(destination); return; }
    root.innerHTML = `<section class="login-card" aria-labelledby="login-heading"><div class="login-symbol">${icon("lock")}</div><h1 id="login-heading">Bạn đã đăng nhập</h1><p class="login-intro">Xin chào ${esc(user.name)}.</p><a class="primary-button" href="index.html">Về trang chủ ${icon("arrow")}</a></section>`;
    return;
  }
  const passwordChanged =
    new URLSearchParams(location.search).get("password_changed") === "1";
  root.innerHTML = `<section class="login-card" aria-labelledby="login-heading"><div class="login-symbol">${icon("lock")}</div><h1 id="login-heading">Đăng nhập</h1><p class="login-intro">Chào mừng bạn trở lại không gian An Việt.</p>${passwordChanged ? '<p class="notice" role="status">Mật khẩu đã đổi. Hãy đăng nhập lại bằng mật khẩu mới.</p>' : ""}<form id="login-form" novalidate><div class="field"><label for="username">Tên đăng nhập</label><input id="username" name="username" class="input" autocomplete="username" required aria-describedby="login-feedback"></div><div class="field"><label for="password">Mật khẩu</label><div class="password"><input type="password" id="password" name="password" class="input" autocomplete="current-password" required aria-describedby="login-feedback"><button type="button" id="show-password" aria-label="Hiện mật khẩu" aria-pressed="false">${icon("eye")}</button></div></div><button class="primary-button" type="submit">Đăng nhập ${icon("arrow")}</button><div class="feedback" id="login-feedback" role="status" aria-live="polite"></div></form><p class="login-help">Tài khoản được cấp bởi quản trị viên.<br>Cần hỗ trợ? Liên hệ bộ phận Công nghệ thông tin.</p></section>`;
  const form = root.querySelector("form"),
    password = root.querySelector("#password"),
    toggle = root.querySelector("#show-password");
  toggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    toggle.setAttribute("aria-pressed", String(show));
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = root.querySelector("#login-feedback");
    const inputs = [...form.querySelectorAll("input")];
    inputs.forEach((i) =>
      i.setAttribute("aria-invalid", String(!i.value.trim())),
    );
    const invalid = inputs.find((i) => !i.value.trim());
    if (invalid) {
      feedback.textContent = "Vui lòng nhập tên đăng nhập và mật khẩu.";
      invalid.focus();
      return;
    }
    if (isPreview()) {
      feedback.textContent = "Thoát chế độ xem thử để sử dụng đăng nhập thật.";
      return;
    }
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    submit.textContent = "Đang đăng nhập…";
    try {
      await api.login(root.querySelector("#username").value.trim(), password.value);
      feedback.textContent = "Đăng nhập thành công. Đang chuyển trang…";
      password.value = "";
      location.href = destination;
    } catch (error) {
      feedback.textContent = error.message || "Không thể đăng nhập. Vui lòng thử lại.";
      password.value = "";
      password.focus();
    } finally {
      submit.disabled = false;
      submit.innerHTML = `Đăng nhập ${icon("arrow")}`;
    }
  });
}
