import { esc, icon } from "../core/ui.js";
export function openModal({ title, body, drawer = false, wide = false }) {
  const previous = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = `dialog${drawer ? " task-drawer" : ""}${wide ? " dialog-wide" : ""}`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-close aria-label="Đóng">${icon("close")}</button></div><div class="dialog-body">${body}</div>`;
  document.body.append(dialog);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  dialog
    .querySelector("[data-close]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialog.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex="0"]',
      ),
    ].filter((el) => !el.disabled && el.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.addEventListener(
    "close",
    () => {
      document.body.style.overflow = previousOverflow;
      dialog.remove();
      if (previous?.isConnected) previous.focus();
    },
    { once: true },
  );
  dialog.showModal();
  return dialog;
}
