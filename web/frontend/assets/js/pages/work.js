import { api } from "../core/data-source.js";
import {
  esc,
  icon,
  badge,
  priority,
  date,
  overdue,
  heading,
  searchInput,
} from "../core/ui.js";
import { projectCard, initProjects } from "../components/project-card.js";
import { openTask } from "../components/task-drawer.js";
export async function render(root, user) {
  const projects = await api.getProjects();
  root.className = "page-container page";
  root.innerHTML = `${heading("Tập trung & phối hợp", user.role === "ADMIN" ? "Không gian công việc" : "Công việc của tôi", user.role === "ADMIN" ? "Tổng quan dự án và công việc trong dữ liệu mẫu." : "Từng bước nhỏ, cùng tạo nên những kết quả lớn.", `<span class="page-date">${icon("calendar")} ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span>`)}<section><div class="section-head"><h2>Dự án ${user.role === "ADMIN" ? "đang triển khai" : "được phân công"}</h2><span class="small-text muted">${projects.length} dự án</span></div><div class="content-grid content-grid-3" id="work-projects">${projects.map(projectCard).join("") || '<p class="muted">Bạn chưa có dự án được phân công.</p>'}</div></section><section class="section"><div class="section-head"><h2>Danh sách công việc</h2><span id="task-count" class="muted small-text" aria-live="polite"></span></div><div class="toolbar">${searchInput("task-search", "Tìm kiếm công việc")}<label class="visually-hidden" for="status-filter">Trạng thái công việc</label><select id="status-filter" class="select"><option value="">Tất cả trạng thái</option value="Pending">Chờ thực hiện</option><option value="In Progress">Đang thực hiện</option><option value="Completed">Hoàn thành</option><option value="overdue">Quá hạn</option></select><label class="visually-hidden" for="project-filter">Dự án</label><select id="project-filter" class="select"><option value="">Tất cả dự án</option>${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div><div class="table-scroll-region" role="region" aria-label="Bảng công việc, cuộn ngang trên màn hình nhỏ" tabindex="0"><table class="data-table"><thead><tr><th scope="col">Công việc</th><th scope="col">Dự án</th><th scope="col">Trạng thái</th><th scope="col">Ưu tiên</th><th scope="col">Hạn hoàn thành</th><th scope="col">Thao tác</th></tr></thead><tbody id="task-body"></tbody></table></div><p class="result-count">Thay đổi trạng thái trong Development Preview chỉ được lưu trong phiên trình duyệt.</p></section>`;
  const search = root.querySelector("#task-search"),
    status = root.querySelector("#status-filter"),
    project = root.querySelector("#project-filter");
  const paint = async () => {
    const tasks = await api.getTasks();
    const q = search.value.trim().toLocaleLowerCase("vi");
    const matches = tasks.filter(
      (t) =>
        t.title.toLocaleLowerCase("vi").includes(q) &&
        (!project.value || t.projectId === project.value) &&
        (!status.value ||
          (status.value === "overdue"
            ? overdue(t)
            : t.status === status.value)),
    );
    root.querySelector("#task-count").textContent =
      `${matches.length} công việc`;
    root.querySelector("#task-body").innerHTML = matches.length
      ? matches
          .map(
            (t) =>
              `<tr><td><button class="task-link" data-task="${t.id}">${esc(t.title)}</button><small>${esc(t.id.toUpperCase())}</small></td><td>${esc(projects.find((p) => p.id === t.projectId)?.name)}</td><td>${badge(t.status)}</td><td>${priority(t.priority)}</td><td>${date(t.due)}${overdue(t) ? '<small class="inline-warning">Quá hạn</small>' : ""}</td><td><button class="icon-button" data-task="${t.id}" aria-label="Xem ${esc(t.title)}">${icon("arrow")}</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6"><div class="empty">Chưa có công việc phù hợp với bộ lọc hoặc phân công của bạn.</div></td></tr>';
  };
  [search, status, project].forEach((el) =>
    el.addEventListener(el === search ? "input" : "change", paint),
  );
  root.querySelector("#task-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-task]");
    if (b) openTask(b.dataset.task, paint);
  });
  document.addEventListener("tasks-updated", paint);
  initProjects(root.querySelector("#work-projects"), projects);
  await paint();
}
