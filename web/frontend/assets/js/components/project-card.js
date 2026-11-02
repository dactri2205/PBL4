import { api } from "../core/data-source.js";
import { esc, icon, badge, date, avatar } from "../core/ui.js";
import { openModal } from "./modal.js";
export function projectCard(p) {
  return `<article class="surface-card project-card"><button class="project-action" data-project="${esc(p.id)}" aria-label="Xem dự án ${esc(p.name)}"></button><div class="project-content"><div class="project-top"><span class="project-symbol">${icon("folder")}</span>${badge(p.status)}</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="progress-label"><span>Tiến độ dự án</span><strong>${p.progress}%</strong></div><div class="progress-track" role="progressbar" aria-label="Tiến độ ${esc(p.name)}" aria-valuenow="${p.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.progress}%"></span></div><div class="project-bottom"><span>${p.members.length} thành viên</span><span>${date(p.due)} &nbsp; ↗</span></div></div></article>`;
}
export function initProjects(root, projects) {
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-project]");
    if (!button) return;
    const p = projects.find((p) => p.id === button.dataset.project);
    if (!p) return;
    const people = await api.getProjectPeople(p.id);
    openModal({
      title: p.name,
      body: `${badge(p.status)}<p class="mt-4">${esc(p.description)}</p><dl class="detail-list"><dt>Mã dự án</dt><dd>${esc(p.code)}</dd><dt>Hạn hoàn thành</dt><dd>${date(p.due)}</dd><dt>Tiến độ</dt><dd>${p.progress}%</dd></dl><h3>Thành viên dự án</h3>${people.map((u) => `<div class="person mb-3">${avatar(u)}<span>${esc(u.name)}<small class="d-block muted">${esc(u.job)}</small></span></div>`).join("")}<p class="notice mt-4">Thông tin dự án mẫu. Danh sách công việc cá nhân chỉ hiển thị theo phân công.</p>`,
    });
  });
}
