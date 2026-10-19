import { api } from "../core/data-source.js";
import {
  esc,
  date,
  badge,
  priority,
  statusLabels,
  toast,
  overdue,
} from "../core/ui.js";
import { openModal } from "./modal.js";
export async function openTask(id, onChange = () => {}) {
  const task = await api.getTask(id);
  if (!task) return;
  const [projects, people] = await Promise.all([
    api.getProjects(),
    api.getTaskPeople(id),
  ]);
  const project = projects.find((p) => p.id === task.projectId);
  const dialog = openModal({
    title: task.title,
    drawer: true,
    body: `${badge(task.status)} ${overdue(task) ? '<span class="status-badge error">Quá hạn</span>' : ""}<p class="mt-4 muted">${esc(task.description)}</p><dl class="detail-list"><dt>Dự án</dt><dd>${esc(project?.name)}</dd><dt>Người thực hiện</dt><dd>${people.map((u) => esc(u.name)).join(", ")}</dd><dt>Ưu tiên</dt><dd>${priority(task.priority)}</dd><dt>Hạn hoàn thành</dt><dd>${date(task.due)}</dd><dt>Ngày tạo</dt><dd>${date(task.created)}</dd><dt>Mã công việc</dt><dd>${esc(task.id.toUpperCase())}</dd></dl><form id="task-status-form"><div class="field"><label for="task-status">Cập nhật trạng thái mẫu</label><select class="select" id="task-status">${Object.entries(
      statusLabels,
    )
      .filter(([key]) => ["Pending", "In Progress", "Completed"].includes(key))
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === task.status ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></div><p class="notice">Development Preview: chỉ lưu trong phiên trình duyệt, không cập nhật máy chủ.</p><p id="task-feedback" class="feedback" role="status"></p><button class="primary-button" type="submit">Lưu trạng thái mẫu</button></form>`,
  });
  dialog.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.updateTask(id, dialog.querySelector("select").value);
      dialog.close();
      await onChange();
      toast("Đã cập nhật trạng thái trong phiên xem thử.");
    } catch (error) {
      dialog.querySelector("#task-feedback").textContent = error.message;
    }
  });
}
