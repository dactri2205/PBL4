import { api } from "../core/data-source.js";
import { esc, icon } from "../core/ui.js";
import { openCompanyDirectory } from "../components/company-directory.js";

function renderKpi(s) {
  const label =
    s.action === "members" ? "Xem thành viên" : "Khám phá phòng ban";
  const content = `<span class="kpi-top"><span>${esc(s.label)}</span>${icon(s.icon)}</span><strong>${esc(s.value)}</strong><small>${esc(s.note)}</small>`;
  const card = s.action
    ? `<button type="button" class="surface-card kpi kpi-link" data-directory="${esc(s.action)}" aria-haspopup="dialog">${content}<span class="kpi-hint">${label} ${icon("arrow")}</span></button>`
    : `<article class="surface-card kpi">${content}</article>`;
  return `<div class="col-12 col-sm-6 col-lg-3">${card}</div>`;
}
export async function render(root) {
  const [stats, news] = await Promise.all([
    api.getStatistics(),
    api.getAnnouncements(),
  ]);
  const latest = news[0];
  root.className = "page-container home";
  root.innerHTML = `<section class="hero" aria-labelledby="hero-title"><div><span class="hero-label"><span class="live-dot"></span> KHÔNG GIAN CHUNG CỦA AN VIỆT</span><h1 id="hero-title">Kết nối hôm nay.<br><em>Kiến tạo ngày mai.</em></h1><p>Nơi thông tin được sẻ chia, con người được kết nối và mỗi đóng góp cùng tạo nên giá trị. Chào mừng bạn đến với không gian làm việc của chúng ta.</p><a href="news.html" class="primary-button">Khám phá bản tin ${icon("arrow")}</a><div class="hero-foot">${icon("users")} Cùng một tinh thần. Cùng một hành trình.</div></div><div class="hero-image"><img src="assets/images/office.jpg" alt="Không gian làm việc chung sáng thoáng, nhiều cây xanh" fetchpriority="high" width="1400" height="934"><div class="image-caption"><span>${icon("building")}</span><span><strong>Không gian cho những ý tưởng lớn</strong><small>Cởi mở · Cộng tác · Phát triển</small></span></div></div></section><div class="home-update"><a class="update-pill" href="news.html?article=${latest.id}"><span>Cập nhật mới</span><span class="update-title">${esc(latest.title)}</span>${icon("arrow")}</a></div><section class="home-stats"><div class="section-head"><div><span class="eyebrow">Một tập thể, nhiều giá trị</span><h2>An Việt qua những con số</h2></div><span class="muted small-text d-none d-md-inline">Bền bỉ xây dựng. Cùng nhau lớn mạnh.</span></div><div class="row g-3">${stats.map(renderKpi).join("")}</div></section><section class="values"><div><span class="eyebrow">Điều làm nên chúng ta</span><h2>Cùng nhau đi xa hơn.</h2><p class="muted small-text">Mỗi cá nhân một thế mạnh.<br>Mỗi kết nối một cơ hội mới.</p></div><div class="value-items">${[
    [
      "01",
      "Kết nối",
      "Thông tin rõ ràng, phối hợp nhịp nhàng giữa các phòng ban.",
    ],
    [
      "02",
      "Đồng hành",
      "Lắng nghe, sẻ chia và hỗ trợ nhau trên mỗi chặng đường.",
    ],
    [
      "03",
      "Phát triển",
      "Không ngừng học hỏi để tạo ra những giá trị bền vững.",
    ],
  ]
    .map(
      ([n, t, d]) =>
        `<article class="value"><span>${n}</span><h3>${t}</h3><p>${d}</p></article>`,
    )
    .join("")}</div></section>`;
  let opening = false;
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-directory]");
    if (!button || opening) return;
    opening = true;
    try {
      await openCompanyDirectory(button.dataset.directory);
    } finally {
      opening = false;
    }
  });
}
