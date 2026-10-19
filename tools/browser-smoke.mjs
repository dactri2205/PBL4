// Optional QA only: npm install --prefix .qa --no-save --package-lock=false playwright-core@1.55.1
import { chromium } from "../.qa/node_modules/playwright-core/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync(".qa/screenshots", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  missing = [],
  external = [];
const results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`);
});
page.on("request", (r) => {
  if (
    !r.url().startsWith("http://localhost:5500") &&
    !r.url().startsWith("data:")
  )
    external.push(r.url());
});
async function visit(path) {
  const response = await page.goto((process.env.PREVIEW_URL || "http://localhost:5500/") + path);
  assert.equal(response.status(), 200);
  await page.waitForSelector('html[data-ready="true"]');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.locator("h1").count(),
    1,
    `${path} has one page heading`,
  );
}
async function select(id) {
  await page.locator("#preview-user").selectOption(id);
  await page.waitForSelector('html[data-ready="true"]');
}
async function overflow(label) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `No page overflow: ${label}`,
  );
}
try {
  await visit("index.html");
  await page.screenshot({
    path: ".qa/screenshots/home-desktop.png",
    fullPage: true,
  });
  assert.equal(await page.locator(".kpi").count(), 4);
  assert.equal(await page.locator(".main-nav a").count(), 2);
  assert.ok(
    await page.evaluate(() =>
      document.fonts.check('600 16px "Be Vietnam Pro"', "Tiếng Việt"),
    ),
  );
  results.push("Guest home: hero, four KPIs, public navigation, local fonts");
  for (const route of [
    "login.html",
    "news.html",
    "department.html",
    "work.html",
    "admin.html",
  ])
    await visit(route);
  await visit("news.html");
  await page.locator("#news-search").fill("bảo trì");
  assert.equal(await page.locator(".news-item").count(), 1);
  await page.locator(".news-item").click();
  await page.waitForSelector(".article");
  results.push("News search and article detail");
  await visit("login.html");
  assert.equal(await page.locator("input[placeholder]").count(), 0);
  await page.locator("[type=submit]").click();
  assert.match(await page.locator("#login-feedback").textContent(), /Vui lòng/);
  await page.locator("#username").fill("someone");
  await page.locator("#password").fill("example");
  await page.locator("#show-password").click();
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  await page.locator("[type=submit]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#login-feedback")
      .textContent.includes("Chưa kết nối"),
  );
  await page.screenshot({
    path: ".qa/screenshots/login-desktop.png",
    fullPage: true,
  });
  results.push(
    "Login labels, no placeholders, validation, password visibility, truthful backend message",
  );
  await visit("work.html?demo=1");
  await select("minh");
  assert.equal(await page.locator(".project-card").count(), 1);
  assert.equal(await page.locator("#task-body tr").count(), 4);
  await page.locator('[data-task="t1"]').first().click();
  await page.waitForSelector("dialog[open]");
  assert.equal(await page.locator(".task-drawer").count(), 1);
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog", { state: "detached" });
  await page.locator('[data-task="t1"]').first().click();
  await page.locator("#task-status").selectOption("Completed");
  await page.locator("#task-status-form [type=submit]").click();
  await page.waitForSelector("dialog", { state: "detached" });
  await page.locator("#status-filter").selectOption("Completed");
  assert.equal(await page.locator("#task-body tr").count(), 2);
  await page.locator("#status-filter").selectOption("");
  await page.screenshot({
    path: ".qa/screenshots/work-desktop.png",
    fullPage: true,
  });
  results.push("Employee task scope, drawer Escape, status update, filter");
  await page.locator("#notification-toggle").click();
  assert.equal(await page.locator(".notification.unread").count(), 2);
  await page.locator("[data-read-all]").click();
  assert.equal(await page.locator(".notification.unread").count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#notification-toggle").getAttribute("aria-expanded"),
    "false",
  );
  results.push("Personal notification dropdown, mark all read, count, Escape");
  await select("linh");
  assert.match(await page.locator("#work-projects").textContent(), /Hạ tầng/);
  assert.equal(await page.locator("#task-body tr").count(), 2);
  assert.equal(await page.locator('[data-task="t1"]').count(), 0);
  results.push("Same-department user sees different projects and tasks");
  await select("mai");
  assert.match(
    await page.locator("#task-body").textContent(),
    /Chưa có công việc/,
  );
  results.push("Unassigned task empty state");
  await select("minh");
  await visit("department.html");
  const member = page.locator(".member-card").first();
  await member.hover({ position: { x: 30, y: 45 } });
  assert.match(
    await member.locator(".member-card-inner").getAttribute("style"),
    /rotateX\(.+rotateY/,
  );
  await page.locator("[data-project]").hover();
  await page.waitForTimeout(550);
  assert.equal(
    await page
      .locator(".project-card")
      .evaluate((el) => getComputedStyle(el, "::before").inset),
    "15px",
  );
  assert.equal(
    await page
      .locator(".project-card")
      .evaluate((el) => getComputedStyle(el, "::before").pointerEvents),
    "none",
  );
  await page.locator("[data-project]").click();
  await page.waitForSelector("dialog[open]");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(
        () => document.activeElement.closest("dialog") !== null,
      ),
    );
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog", { state: "detached" });
  assert.equal(
    await page
      .locator("[data-project]")
      .evaluate((el) => document.activeElement === el),
    true,
  );
  const track = page.locator("#member-track");
  await track.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(450);
  assert.ok((await track.evaluate((el) => el.scrollLeft)) > 0);
  await page.screenshot({
    path: ".qa/screenshots/department-desktop.png",
    fullPage: true,
  });
  results.push(
    "Department bento, project modal, animated border and keyboard carousel",
  );
  await select("admin");
  await visit("admin.html");
  assert.equal(await page.locator("#users-body tr").count(), 7);
  await page.locator('[data-user="linh"][data-action="edit"]').click();
  await page.locator("#edit-role").selectOption("ADMIN");
  await page.locator("#user-form [type=submit]").click();
  await page.locator("[data-confirm]").click();
  await page.waitForSelector("dialog", { state: "detached" });
  assert.match(
    await page
      .locator("#users-body tr")
      .filter({ hasText: "Lê Thùy Linh" })
      .textContent(),
    /ADMIN/,
  );
  await page.locator("#add-user").click();
  await page.locator("#edit-name").fill("<img src=x onerror=alert(1)>");
  await page.locator("#edit-username").fill("test.user");
  await page.locator("#user-form [type=submit]").click();
  await page.waitForSelector("dialog", { state: "detached" });
  assert.equal(await page.locator('#users-body img[src="x"]').count(), 0);
  assert.equal(await page.locator("#users-body tr").count(), 8);
  await page.locator('[data-user="linh"][data-action="toggle"]').click();
  await page.locator("[data-confirm]").click();
  await page.waitForSelector("dialog", { state: "detached" });
  await page.screenshot({
    path: ".qa/screenshots/admin-desktop.png",
    fullPage: true,
  });
  results.push(
    "Admin role edit with confirmation, add user, escaped input, disable confirmation",
  );
  for (const width of [1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "index.html",
      "login.html",
      "news.html",
      "department.html",
      "work.html",
      "admin.html",
    ]) {
      await visit(route);
      await overflow(`${route}@${width}`);
    }
    results.push(`All six pages: no horizontal page overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("index.html");
  await page.locator("#menu-toggle").click();
  assert.equal(
    await page.locator("#menu-toggle").getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#menu-toggle").getAttribute("aria-expanded"),
    "false",
  );
  await page.screenshot({
    path: ".qa/screenshots/home-mobile.png",
    fullPage: true,
  });
  await visit("department.html");
  await page.screenshot({
    path: ".qa/screenshots/department-mobile.png",
    fullPage: true,
  });
  await visit("work.html");
  await page.locator('[data-task="t1"]').first().click();
  await page.screenshot({
    path: ".qa/screenshots/drawer-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  results.push("Mobile navigation Escape and mobile drawer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await visit("department.html");
  assert.equal(
    await page
      .locator(".member-card-inner")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  results.push("Reduced motion disables transitions");
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  assert.deepEqual(external, []);
  results.push(
    "No page errors, missing resources or external runtime requests",
  );
  console.log(results.map((r) => "PASS " + r).join("\n"));
  writeFileSync(
    ".qa/results.json",
    JSON.stringify({ results, errors, missing, external }, null, 2),
  );
} finally {
  await browser.close();
}
