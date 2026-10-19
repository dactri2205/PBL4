import { api } from "../core/data-source.js";
import { esc, icon, searchInput } from "../core/ui.js";
import { openModal } from "./modal.js";
import {
  memberCarousel,
  carouselShell,
  initCarousel,
} from "./member-carousel.js";

const normalize = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();

export async function openCompanyDirectory(mode = "members") {
  const { members, departments } = await api.getCompanyDirectory();
  const dialog = openModal({
    title:
      mode === "departments"
        ? "Khám phá phòng ban"
        : "Ban lãnh đạo & Trưởng phòng",
    body: "",
    wide: true,
  });
  const body = dialog.querySelector(".dialog-body");
  const title = dialog.querySelector("#dialog-title");
  let dispose = () => {};
  dialog.addEventListener("close", () => dispose(), { once: true });

  function showMembers(department = null) {
    dispose();
    title.textContent = department
      ? department.name
      : "Ban lãnh đạo & Trưởng phòng";
    body.innerHTML = `${department ? `<button class="secondary-button directory-back" data-back>${icon("left")} Tất cả phòng ban</button>` : ""}
      <p class="muted">${department ? esc(department.description) : "Gặp gỡ những người dẫn dắt An Việt. Tìm kiếm bên dưới để kết nối với mọi thành viên."}</p>
      <div class="toolbar directory-search">${searchInput("directory-search", department ? "Tìm thành viên trong phòng ban" : "Tìm tên, chức danh trong toàn công ty")}
      <button class="secondary-button" data-clear hidden>Xóa tìm kiếm</button></div>
      <p class="result-count" data-count role="status" aria-live="polite"></p><div data-results></div>`;
    const input = body.querySelector("input");
    const clear = body.querySelector("[data-clear]");
    const results = body.querySelector("[data-results]");
    function paint() {
      dispose();
      const query = normalize(input.value);
      const list = members.filter(
        (u) =>
          (!department || u.departmentId === department.id) &&
          (query
            ? normalize(`${u.name} ${u.job} ${u.departmentName}`).includes(
                query,
              )
            : department || u.isLeader),
      );
      clear.hidden = !input.value;
      title.textContent = department
        ? department.name
        : query
          ? "Tìm kiếm thành viên"
          : "Ban lãnh đạo & Trưởng phòng";
      body.querySelector("[data-count]").textContent = query
        ? `${list.length} thành viên phù hợp${department ? " trong phòng ban" : " trong toàn công ty"}`
        : `${list.length} ${department ? "thành viên phòng ban" : "lãnh đạo và trưởng phòng"}`;
      results.innerHTML = list.length
        ? memberCarousel(list, {
            id: "directory-member-track",
            title: query
              ? "Kết quả tìm kiếm"
              : department
                ? "Đội ngũ phòng ban"
                : "Những người dẫn dắt",
            eyebrow: department ? department.code : "Con người An Việt",
            showDepartment: true,
          })
        : `<div class="directory-empty">${icon("users")}<h3>${query ? "Không tìm thấy thành viên phù hợp" : "Chưa có thành viên được giới thiệu"}</h3><p>${query ? "Thử tên khác hoặc xóa từ khóa để xem lại danh sách." : "Thông tin đội ngũ sẽ được cập nhật tại đây."}</p></div>`;
      dispose = initCarousel(results);
    }
    input.addEventListener("input", paint);
    clear.addEventListener("click", () => {
      input.value = "";
      paint();
      input.focus();
    });
    body
      .querySelector("[data-back]")
      ?.addEventListener("click", () => showDepartments(department.id));
    paint();
    if (department) input.focus();
  }

  function showDepartments(focusId = null) {
    dispose();
    title.textContent = "Khám phá phòng ban";
    body.innerHTML = `<p class="muted">Mỗi phòng ban một thế mạnh. Chọn phòng để gặp gỡ đội ngũ đồng hành.</p>
      <p class="result-count">${departments.length} phòng ban · ${members.length} thành viên, bao gồm Ban điều hành</p>
      ${
        departments.length
          ? carouselShell(
              departments
                .map(
                  (
                    d,
                  ) => `<article class="member-card carousel-slide department-slide"><button class="department-card" data-department="${esc(d.id)}" aria-label="Xem thành viên phòng ${esc(d.name)}">
        <span class="department-card-top"><span class="project-symbol">${icon("building")}</span><span class="eyebrow">${esc(d.code)}</span></span>
        <h3>${esc(d.name)}</h3><p>${esc(d.description)}</p><span class="department-card-bottom"><span>${d.memberCount} thành viên</span><span class="text-link">Xem đội ngũ ${icon("arrow")}</span></span>
        </button></article>`,
                )
                .join(""),
              {
                id: "directory-department-track",
                title: "Các phòng ban",
                eyebrow: "Kết nối chuyên môn",
                label: "Danh sách phòng ban",
              },
            )
          : '<p class="directory-empty">Chưa có phòng ban được giới thiệu.</p>'
      }`;
    dispose = initCarousel(body);
    body.querySelectorAll("[data-department]").forEach((button) =>
      button.addEventListener("click", () => {
        const department = departments.find(
          (d) => d.id === button.dataset.department,
        );
        if (department) showMembers(department);
      }),
    );
    if (focusId)
      body.querySelector(`[data-department="${CSS.escape(focusId)}"]`)?.focus();
  }
  if (mode === "departments") showDepartments();
  else showMembers();
  return dialog;
}
