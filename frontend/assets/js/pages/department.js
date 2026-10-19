import { api } from "../core/data-source.js";
import { esc, icon, heading } from "../core/ui.js";
import { projectCard, initProjects } from "../components/project-card.js";
import { memberCarousel, initCarousel } from "../components/member-carousel.js";
export async function render(root, user) {
  const dep = await api.getDepartment();
  root.className = "page-container page";
  if (!dep) {
    root.innerHTML = '<p class="empty">Chưa có thông tin phòng ban.</p>';
    return;
  }
  root.innerHTML = `${heading("Phòng ban của tôi", dep.name, "Cùng chuyên môn. Chung mục tiêu.")}<div class="bento"><section><span class="project-symbol">${icon("building")}</span><h2>Chúng tôi là ${esc(dep.code)}</h2><p>${esc(dep.description)}</p></section><section><span class="muted small-text">Thành viên phòng ban</span><strong class="big-stat">${String(dep.members.length).padStart(2, "0")}</strong><p>Những người cùng đồng hành</p></section><section><span class="muted small-text">Dự án ${user.role === "ADMIN" ? "trong phòng ban" : "được phân công"}</span><strong class="big-stat">${String(dep.projects.length).padStart(2, "0")}</strong><p>${user.role === "ADMIN" ? "Góc nhìn quản trị viên" : "Trong phạm vi công việc của bạn"}</p></section><section class="bento-goal"><div><span class="eyebrow">Mục tiêu chung · Quý IV / 2026</span><h2>${esc(dep.goal)}</h2><p>${esc(dep.goalDescription)}</p></div><div><div class="progress-label"><span>Tiến độ mục tiêu phòng ban</span><strong>${dep.progress}%</strong></div><div class="progress-track" role="progressbar" aria-label="Mục tiêu phòng ban" aria-valuenow="${dep.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${dep.progress}%"></span></div></div></section></div>${memberCarousel(dep.members)}<section class="section"><div class="section-head"><div><span class="eyebrow">Cùng tạo giá trị</span><h2>Dự án ${user.role === "ADMIN" ? "của phòng ban" : "bạn tham gia"}</h2></div><a class="text-link" href="work.html">Đến công việc ${icon("arrow")}</a></div><div class="content-grid content-grid-3" id="department-projects">${dep.projects.map(projectCard).join("") || '<p class="muted">Bạn chưa được phân công vào dự án nào trong phòng ban.</p>'}</div></section>`;
  initCarousel(root);
  initProjects(root.querySelector("#department-projects"), dep.projects);
}
