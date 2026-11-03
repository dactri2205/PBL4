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
import { isPreview } from "../core/demo-session.js";
export async function openTask(id, onChange = () => {}) {
  let task;
  try {
    task = await api.getTask(id);
  } catch (error) {
    toast(error.message);
    return;
  }
  if (!task) return;
  const [projects, people] = await Promise.all([
    api.getProjects(),
    api.getTaskPeople(id),
  ]);
  const project = projects.find((p) => p.id === task.projectId);
  const preview = isPreview();
  const dialog = openModal({
    title: task.title,
    drawer: true,
    body: `${badge(task.status)} ${overdue(task) ? '<span class="status-badge error">Quá hạn</span>' : ""}<p class="mt-4 muted">${esc(task.description)}</p><dl class="detail-list"><dt>Dự án</dt><dd>${esc(project?.name)}</dd><dt>Người thực hiện</dt><dd>${people.map((u) => esc(u.name)).join(", ")}</dd><dt>Ưu tiên</dt><dd>${priority(task.priority)}</dd><dt>Hạn hoàn thành</dt><dd>${date(task.due)}</dd><dt>Ngày tạo</dt><dd>${date(task.created)}</dd><dt>Mã công việc</dt><dd>${esc(task.id.toUpperCase())}</dd></dl><form id="task-status-form"><div class="field"><label for="task-status">${preview ? "Cập nhật trạng thái mẫu" : "Cập nhật trạng thái"}</label><select class="select" id="task-status">${Object.entries(
      statusLabels,
    )
      .filter(([key]) => ["Pending", "In Progress", "Completed"].includes(key))
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === task.status ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></div><p class="notice">${preview ? "Development Preview: chỉ lưu trong phiên trình duyệt, không cập nhật máy chủ." : "Trạng thái được kiểm tra quyền và lưu bởi API."}</p><p id="task-feedback" class="feedback" role="status"></p><button class="primary-button" type="submit">${preview ? "Lưu trạng thái mẫu" : "Lưu trạng thái"}</button></form>`,
  });
  dialog.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api.updateTask(id, dialog.querySelector("select").value);
      dialog.close();
      await onChange();
      toast(preview ? "Đã cập nhật trạng thái trong phiên xem thử." : "Đã lưu trạng thái công việc.");
    } catch (error) {
      dialog.querySelector("#task-feedback").textContent = error.message;
    }
  });
}
