import { esc, icon } from "../core/ui.js";
export function carouselShell(
  content,
  {
    id = "member-track",
    title = "Đội ngũ của chúng ta",
    eyebrow = "Những người đồng hành",
    label = "Danh sách thành viên",
  } = {},
) {
  return `<section class="section card-carousel" aria-label="${esc(label)}"><div class="section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><div class="carousel-controls"><button class="icon-button" data-carousel="-1" aria-label="Trượt về trước" aria-controls="${esc(id)}">${icon("left")}</button><button class="icon-button" data-carousel="1" aria-label="Trượt tiếp theo" aria-controls="${esc(id)}">${icon("chevron")}</button></div></div><div class="carousel-track" id="${esc(id)}" tabindex="0" aria-label="${esc(label)}; dùng phím mũi tên để cuộn">${content}</div></section>`;
}
export function memberCarousel(members, options = {}) {
  return carouselShell(
    members
      .map(
        (u) =>
          `<article class="member-card"><div class="member-card-inner">${u.photo ? `<img src="assets/images/${esc(u.photo)}.jpg" alt="Ảnh minh họa cho ${esc(u.name)}" loading="lazy">` : `<img src="assets/images/portrait-fallback.svg" alt="Hình đại diện minh họa" loading="lazy">`}<div class="member-caption"><h3>${esc(u.name)}</h3><small>${esc(u.job)}</small>${options.showDepartment ? `<span class="member-department">${esc(u.departmentName)}</span>` : ""}</div></div></article>`,
      )
      .join(""),
    options,
  );
}
export function initCarousel(root) {
  const track = root.querySelector(".carousel-track");
  if (!track) return () => {};
  const controller = new AbortController();
  const signal = controller.signal;
  const controls = root.querySelector(".carousel-controls");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const move = (direction) =>
    track.scrollBy({
      left:
        direction *
        (track.querySelector(".member-card")?.getBoundingClientRect().width +
          20 || 250),
      behavior: reduced.matches ? "instant" : "smooth",
    });
  const update = () => {
    controls.hidden = track.scrollWidth <= track.clientWidth + 2;
    const buttons = controls.querySelectorAll("button");
    buttons[0].disabled = track.scrollLeft < 3;
    buttons[1].disabled =
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 3;
  };
  controls.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-carousel]");
      if (b) move(Number(b.dataset.carousel));
    },
    { signal },
  );
  track.addEventListener(
    "keydown",
    (e) => {
      if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        move(e.key === "ArrowRight" ? 1 : -1);
      }
    },
    { signal },
  );
  track.addEventListener("scroll", update, { passive: true, signal });
  const observer = new ResizeObserver(update);
  observer.observe(track);
  update();
  let drag = null,
    suppressClick = false;
  track.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "mouse" && e.button === 0) {
        suppressClick = false;
        drag = { x: e.clientX, left: track.scrollLeft, captured: false };
      }
    },
    { signal },
  );
  track.addEventListener(
    "pointermove",
    (e) => {
      if (!drag) return;
      if (!drag.captured && Math.abs(e.clientX - drag.x) > 5) {
        drag.captured = true;
        suppressClick = true;
        track.setPointerCapture(e.pointerId);
        track
          .querySelectorAll(".member-card-inner")
          .forEach((el) => (el.style.transform = ""));
      }
      if (drag.captured) {
        e.preventDefault();
        track.scrollLeft = drag.left + drag.x - e.clientX;
      }
    },
    { signal },
  );
  track.addEventListener("pointerup", () => (drag = null), { signal });
  track.addEventListener("pointercancel", () => (drag = null), { signal });
  track.addEventListener(
    "pointerleave",
    () => {
      if (!drag?.captured) drag = null;
    },
    { signal },
  );
  track.addEventListener(
    "click",
    (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    },
    { capture: true, signal },
  );
  track.querySelectorAll("img").forEach((img) => (img.draggable = false));
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    track.querySelectorAll(".member-card").forEach((card) => {
      const inner = card.firstElementChild;
      if (!inner.classList.contains("member-card-inner")) return;
      card.addEventListener(
        "pointermove",
        (e) => {
          if (reduced.matches || drag) return;
          const r = card.getBoundingClientRect();
          inner.style.transform = `rotateX(${(-(e.clientY - r.top - r.height / 2) / r.height) * 12}deg) rotateY(${((e.clientX - r.left - r.width / 2) / r.width) * 12}deg)`;
        },
        { signal },
      );
      card.addEventListener(
        "pointerleave",
        () => (inner.style.transform = ""),
        { signal },
      );
    });
  }
  return () => {
    controller.abort();
    observer.disconnect();
  };
}
