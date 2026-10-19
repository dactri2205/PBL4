import { api } from "../core/data-source.js";
import { esc, icon, date, heading, searchInput } from "../core/ui.js";
export async function render(root) {
  const items = await api.getAnnouncements();
  const articleId = new URLSearchParams(location.search).get("article");
  const selected = items.find((n) => n.id === articleId);
  root.className = "page-container page";
  if (selected) {
    root.innerHTML = `<article class="article"><a class="text-link" href="news.html">${icon("left")} Tất cả bản tin</a><div class="mt-4"><span class="status-badge info">${esc(selected.category)}</span> <time class="small-text muted" datetime="${selected.date}">${date(selected.date)}</time></div><h1>${esc(selected.title)}</h1><p class="muted">${esc(selected.summary)}</p><div class="article-body">${selected.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div><p class="small-text muted mt-4">Ban truyền thông An Việt · Nội dung minh họa</p></article>`;
    return;
  }
  root.innerHTML = `${heading("Thông tin & kết nối", "Bản tin An Việt", "Những cập nhật giúp chúng ta luôn cùng một nhịp.")}<div class="toolbar"><div class="tabs" aria-label="Lọc chuyên mục">${["Tất cả", ...new Set(items.map((n) => n.category))].map((c, i) => `<button data-category="${c}" aria-pressed="${i === 0}">${c}</button>`).join("")}</div></div><div class="toolbar">${searchInput("news-search", "Tìm kiếm bản tin")}<span class="result-count" id="news-count" aria-live="polite"></span></div><div class="news-list" id="news-list"></div>`;
  let category = "Tất cả";
  const input = root.querySelector("#news-search");
  const paint = () => {
    const q = input.value.trim().toLocaleLowerCase("vi");
    const matches = items.filter(
      (n) =>
        (category === "Tất cả" || n.category === category) &&
        `${n.title} ${n.summary}`.toLocaleLowerCase("vi").includes(q),
    );
    root.querySelector("#news-count").textContent = `${matches.length} bản tin`;
    root.querySelector("#news-list").innerHTML = matches.length
      ? matches
          .map(
            (n) =>
              `<a class="news-item" href="news.html?article=${n.id}"><time datetime="${n.date}">${date(n.date)}</time><div><span class="status-badge info">${esc(n.category)}</span><h2>${esc(n.title)}</h2><p>${esc(n.summary)}</p></div>${icon("arrow")}</a>`,
          )
          .join("")
      : '<p class="empty">Không có bản tin phù hợp. Hãy thử từ khóa khác.</p>';
  };
  input.addEventListener("input", paint);
  root.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-category]");
    if (!b) return;
    category = b.dataset.category;
    root
      .querySelectorAll("[data-category]")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === b)));
    paint();
  });
  paint();
}
