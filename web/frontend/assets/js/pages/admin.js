import { api } from "../core/data-source.js";
import {
  esc,
  icon,
  avatar,
  badge,
  heading,
  searchInput,
  toast,
} from "../core/ui.js";
import { openModal } from "../components/modal.js";
export async function render(root, user) {
  const departments = await api.getDepartments();
  let users = await api.getUsers();
  root.className = "page-container page";
  root.innerHTML = `${heading("Quản trị hệ thống", "Quản lý người dùng", "Đồng bộ đội ngũ, rõ ràng vai trò và phòng ban.", `<button class="primary-button" id="add-user">${icon("plus")} Thêm người dùng</button>`)}<div class="content-grid content-grid-3 admin-summary" id="admin-stats"></div><div class="toolbar">${searchInput("user-search", "Tìm tên hoặc tên đăng nhập")}<label class="visually-hidden" for="role-filter">Vai trò</label><select class="select" id="role-filter"><option value="">Tất cả vai trò</option><option>ADMIN</option><option>EMPLOYEE</option></select><label class="visually-hidden" for="department-filter">Phòng ban</label><select class="select" id="department-filter"><option value="">Tất cả phòng ban</option>${departments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div><div class="table-scroll-region" role="region" aria-label="Bảng người dùng, cuộn ngang trên màn hình nhỏ" tabindex="0"><table class="data-table"><thead><tr><th scope="col">Ảnh</th><th scope="col">Tên / Tên đăng nhập</th><th scope="col">Vai trò</th><th scope="col">Phòng ban</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="users-body"></tbody></table></div><div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-3"><span class="result-count" id="user-count" aria-live="polite"></span><button id="reset-data" class="secondary-button">${icon("reset")} Khôi phục dữ liệu mẫu</button></div><p class="notice mt-3">Development Preview: mọi thao tác chỉ thay đổi dữ liệu trong phiên trình duyệt. Chưa tạo, sửa hoặc vô hiệu hóa tài khoản trên máy chủ.</p>`;
  const search = root.querySelector("#user-search"),
    role = root.querySelector("#role-filter"),
    dep = root.querySelector("#department-filter");
  const paint = async () => {
    users = await api.getUsers();
    const q = search.value.trim().toLocaleLowerCase("vi");
    const list = users.filter(
      (u) =>
        (u.name + " " + u.username).toLocaleLowerCase("vi").includes(q) &&
        (!role.value || role.value === u.role) &&
        (!dep.value || dep.value === u.departmentId),
    );
    root.querySelector("#users-body").innerHTML = list.length
      ? list
          .map(
            (u) =>
              `<tr><td>${avatar(u)}</td><td class="admin-name"><strong>${esc(u.name)}</strong><small>${esc(u.username)}</small></td><td><span class="status-badge ${u.role === "ADMIN" ? "info" : ""}">${esc(u.role)}</span></td><td>${esc(departments.find((d) => d.id === u.departmentId)?.name || "Chưa phân phòng")}</td><td>${badge(u.status)}</td><td><div class="admin-actions"><button class="icon-button" data-action="view" data-user="${u.id}" aria-label="Xem ${esc(u.name)}">${icon("eye")}</button><button class="icon-button" data-action="edit" data-user="${u.id}" aria-label="Sửa ${esc(u.name)}">${icon("edit")}</button><button class="icon-button" data-action="toggle" data-user="${u.id}" aria-label="${u.status === "Active" ? "Vô hiệu hóa" : "Kích hoạt"} ${esc(u.name)}" ${u.id === user.id ? "disabled" : ""}>${icon("power")}</button></div></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="empty">Không có tài khoản phù hợp.</td></tr>';
    root.querySelector("#user-count").textContent =
      `Hiển thị ${list.length} / ${users.length} người dùng`;
    root.querySelector("#admin-stats").innerHTML = [
      ["Tổng tài khoản", users.length, "users"],
      [
        "Đang hoạt động",
        users.filter((u) => u.status === "Active").length,
        "check",
      ],
      [
        "Quản trị viên",
        users.filter((u) => u.role === "ADMIN").length,
        "shield",
      ],
    ]
      .map(
        ([label, value, ic]) =>
          `<article class="surface-card kpi"><div class="kpi-top">${label}${icon(ic)}</div><strong>${String(value).padStart(2, "0")}</strong></article>`,
      )
      .join("");
  };
  const openEditor = (existing = null) => {
    const u = existing || {
      name: "",
      username: "",
      role: "EMPLOYEE",
      departmentId: departments[0].id,
      status: "Active",
    };
    const dialog = openModal({
      title: existing ? "Chỉnh sửa người dùng" : "Thêm người dùng mẫu",
      body: `<form id="user-form"><div class="field"><label for="edit-name">Họ và tên</label><input class="input" id="edit-name" name="name" value="${esc(u.name)}" maxlength="80" required></div><div class="field"><label for="edit-username">Tên đăng nhập</label><input class="input" id="edit-username" name="username" value="${esc(u.username)}" ${existing ? "readonly" : 'required pattern="[-a-zA-Z0-9_.]{3,32}"'}></div><div class="field"><label for="edit-role">Vai trò</label><select class="select" id="edit-role" name="role">${["ADMIN", "EMPLOYEE"].map((r) => `<option ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}</select></div><div class="field"><label for="edit-department">Phòng ban</label><select class="select" id="edit-department" name="departmentId">${departments.map((d) => `<option value="${d.id}" ${d.id === u.departmentId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>${existing ? `<div class="field"><label for="edit-status">Trạng thái</label><select class="select" id="edit-status" name="status"><option value="Active" ${u.status === "Active" ? "selected" : ""}>Hoạt động</option><option value="Disabled" ${u.status === "Disabled" ? "selected" : ""}>Vô hiệu hóa</option></select></div>` : ""}<p class="notice">Chỉ cập nhật dữ liệu mẫu trong phiên. Phân công dự án không tự thay đổi theo phòng ban.</p><p class="feedback" id="edit-feedback" role="status"></p><div class="dialog-actions"><button type="button" class="secondary-button" data-cancel>Hủy</button><button type="submit" class="primary-button">${existing ? "Xem lại thay đổi" : "Thêm vào dữ liệu mẫu"}</button></div></form>`,
    });
    dialog
      .querySelector("[data-cancel]")
      .addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.target));
      if (existing) {
        const sensitive =
          values.role !== u.role ||
          values.departmentId !== u.departmentId ||
          values.status !== u.status;
        if (sensitive) {
          const form = dialog.querySelector("form");
          form.hidden = true;
          const review = document.createElement("div");
          review.innerHTML = `<p>Xác nhận thay đổi quyền hoặc trạng thái của <strong>${esc(u.name)}</strong>?</p><dl class="detail-list"><dt>Vai trò</dt><dd>${esc(u.role)} → ${esc(values.role)}</dd><dt>Phòng ban</dt><dd>${esc(departments.find((d) => d.id === values.departmentId)?.name)}</dd><dt>Trạng thái</dt><dd>${badge(values.status)}</dd></dl><p class="notice">Chỉ áp dụng cho dữ liệu mẫu.</p><p class="feedback" role="status"></p><div class="dialog-actions"><button class="secondary-button" data-back>Quay lại</button><button class="primary-button" data-confirm>Xác nhận</button></div>`;
          dialog.querySelector(".dialog-body").append(review);
          review.querySelector("[data-back]").addEventListener("click", () => {
            review.remove();
            form.hidden = false;
            form.querySelector("input").focus();
          });
          review
            .querySelector("[data-confirm]")
            .addEventListener("click", async () => {
              try {
                await api.updateUser(u.id, values);
                dialog.close();
                await paint();
                if (u.id === user.id) location.reload();
                toast("Đã cập nhật dữ liệu mẫu trong phiên.");
              } catch (error) {
                review.querySelector("[role=status]").textContent =
                  error.message;
              }
            });
          review.querySelector("[data-confirm]").focus();
          return;
        }
      }
      try {
        if (existing) await api.updateUser(u.id, values);
        else await api.createUser(values);
        dialog.close();
        await paint();
        if (existing?.id === user.id) location.reload();
        toast("Đã lưu người dùng vào dữ liệu mẫu trong phiên.");
      } catch (error) {
        dialog.querySelector("#edit-feedback").textContent = error.message;
      }
    });
  };
  root.querySelector("#add-user").addEventListener("click", () => openEditor());
  root.querySelector("#users-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-user]");
    if (!b) return;
    const u = users.find((u) => u.id === b.dataset.user);
    if (b.dataset.action === "edit") {
      openEditor(u);
      return;
    }
    if (b.dataset.action === "view") {
      openModal({
        title: "Thông tin tài khoản",
        body: `<div class="person">${avatar(u)}<h3>${esc(u.name)}</h3></div><dl class="detail-list"><dt>Tên đăng nhập</dt><dd>${esc(u.username)}</dd><dt>Vai trò</dt><dd>${esc(u.role)}</dd><dt>Phòng ban</dt><dd>${esc(departments.find((d) => d.id === u.departmentId)?.name)}</dd><dt>Vị trí</dt><dd>${esc(u.job)}</dd><dt>Trạng thái</dt><dd>${badge(u.status)}</dd></dl>`,
      });
      return;
    }
    const active = u.status === "Active";
    const dialog = openModal({
      title: active ? "Vô hiệu hóa tài khoản mẫu?" : "Kích hoạt tài khoản mẫu?",
      body: `<p>Bạn muốn ${active ? "vô hiệu hóa" : "kích hoạt"} <strong>${esc(u.name)}</strong> trong dữ liệu mẫu?</p><p class="notice">Không thay đổi tài khoản trên máy chủ.</p><p class="feedback" role="status"></p><div class="dialog-actions"><button class="secondary-button" data-cancel>Hủy</button><button class="primary-button" data-confirm>Xác nhận</button></div>`,
    });
    dialog
      .querySelector("[data-cancel]")
      .addEventListener("click", () => dialog.close());
    dialog
      .querySelector("[data-confirm]")
      .addEventListener("click", async () => {
        try {
          await api.updateUser(u.id, {
            ...u,
            status: active ? "Disabled" : "Active",
          });
          dialog.close();
          await paint();
          toast("Đã thay đổi trạng thái trong dữ liệu mẫu.");
        } catch (error) {
          dialog.querySelector("[role=status]").textContent = error.message;
        }
      });
  });
  [search, role, dep].forEach((el) =>
    el.addEventListener(el === search ? "input" : "change", paint),
  );
  root.querySelector("#reset-data").addEventListener("click", () => {
    const dialog = openModal({
      title: "Khôi phục dữ liệu ban đầu?",
      body: '<p>Các thay đổi người dùng, trạng thái công việc và thông báo trong phiên mẫu sẽ được đặt lại.</p><div class="dialog-actions"><button class="secondary-button" data-cancel>Hủy</button><button class="primary-button" data-confirm>Khôi phục dữ liệu mẫu</button></div>',
    });
    dialog
      .querySelector("[data-cancel]")
      .addEventListener("click", () => dialog.close());
    dialog
      .querySelector("[data-confirm]")
      .addEventListener("click", () => api.reset());
  });
  await paint();
}
