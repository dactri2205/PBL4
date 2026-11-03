// Optional integration QA with installed Chrome and Node's native CDP/WebSocket.
// Run against the disposable .NET management-test host, never production accounts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.PREVIEW_URL;
if (!base || !/^https?:\/\/127\.0\.0\.1:\d+\/$/.test(base)) throw Error("Use the disposable loopback management-test host.");
const username = process.env.MINIVPN_ADMIN_USERNAME || "vpn-admin";
const password = process.env.MINIVPN_ADMIN_PASSWORD;
const portalMode = process.env.MINIVPN_BROWSER_PORTAL === "1";
if (!password) throw Error("Test admin password required through environment.");
const output = resolve(".qa/vpn-browser");
const profile = resolve(output, "profile-" + Date.now());
await mkdir(profile, { recursive: true });
const chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
  "--disable-sync", "--disable-default-apps", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank",
  ...(process.env.MINIVPN_BROWSER_CERT_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.MINIVPN_BROWSER_CERT_SPKI}`] : []),
], { windowsHide: true, stdio: "ignore" });
let socket;
const pending = new Map();
let sequence = 0;
const errors = [], missing = [], external = [];
function send(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolveRequest, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error("CDP request timed out: " + method)); }, 10000);
    pending.set(id, { resolve: resolveRequest, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
let session;
const call = (method, params) => send(method, params, session);
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error("Browser evaluation failed");
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 150; i++) {
    try { if (await evaluate(expression)) return; }
    catch (error) { if (!/context|Cannot find/.test(error.message)) throw error; }
    await delay(100);
  }
  throw Error("Browser condition did not become ready");
}
const click = async (selector) => { assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), true); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
async function visit(path) {
  await call("Page.navigate", { url: base + path });
  await until('document.documentElement.dataset.ready === "true"');
}
async function screenshot(name) {
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(resolve(output, name + ".png"), Buffer.from(shot.data, "base64"));
}
const checks = [];
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split(/\r?\n/); break; }
    catch { if (chrome.exitCode !== null) throw Error("Chrome exited before CDP was available"); await delay(100); }
  }
  if (!port) throw Error("Chrome debugging endpoint unavailable");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const item = pending.get(message.id); if (!item) return;
      clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.responseReceived" && message.params.response.status >= 400 &&
        !(message.params.response.status === 401 && new URL(message.params.response.url).pathname === "/api/me"))
      missing.push(`${message.params.response.status} ${message.params.response.url}`);
    if (message.method === "Network.requestWillBeSent") {
      const url = message.params.request.url;
      if (!url.startsWith(base) && !url.startsWith("data:") && !url.startsWith("about:")) external.push(url);
    }
  };
  const target = await send("Target.createTarget", { url: "about:blank" });
  session = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await visit("index.html?demo=1"); assert.equal(await evaluate('document.querySelectorAll(".kpi").length'), 3);
  await evaluate('sessionStorage.setItem("preview-user", "admin"); true');
  await visit("vpn-admin.html?demo=1");
  await until(portalMode ? 'Boolean(document.querySelector("#vpn-portal-login"))' : 'Boolean(document.querySelector("#vpn-login"))');
  checks.push("Preview query does not grant VPN access; server login is required");
  if (portalMode) {
    await click("#vpn-portal-login");
    await until('Boolean(document.querySelector("#login-form"))');
    await fill("#username", username); await fill("#password", password);
    await click("#login-form button[type=submit]");
  } else {
    await fill("#vpn-username", username); await fill("#vpn-password", password);
    await click("#vpn-login button[type=submit]");
  }
  await until('Boolean(document.querySelector("#vpn-metrics .vpn-metric"))');
  assert.equal(await evaluate('document.querySelector("#vpn-live-state").classList.contains("success")'), true);
  await screenshot("overview-desktop"); checks.push("Server login, CSRF, real overview and metrics render");
  await click('[data-tab="accounts"]'); await click("#vpn-create");
  await fill("#new-vpn-user", "browser_test"); await fill("#new-vpn-password", "browser-test-password-private");
  await fill("#new-vpn-notes", '<img src=x onerror="window.__xss=true">');
  await click("#vpn-account-form button[type=submit]");
  await until('!document.querySelector("dialog") && Boolean(document.querySelector(\'[data-account="browser_test"]\')) && document.querySelector("#vpn-refresh").disabled === false');
  assert.equal(await evaluate('document.querySelectorAll("#vpn-account-rows img").length'), 0);
  await fill("#vpn-search", "browser_test");
  assert.equal(await evaluate('document.querySelectorAll("#vpn-account-rows tr").length'), 1);
  await click('[data-account="browser_test"][data-action="disable"]');
  await until('Boolean(document.querySelector("dialog[open]"))'); await click("[data-confirm]");
  await until('!document.querySelector("dialog") && Boolean(document.querySelector(\'[data-account="browser_test"][data-action="enable"]\')) && document.querySelector("#vpn-refresh").disabled === false');
  await click('[data-account="browser_test"][data-action="enable"]');
  await until('Boolean(document.querySelector(\'[data-account="browser_test"][data-action="disable"]\')) && document.querySelector("#vpn-refresh").disabled === false');
  await click('[data-account="browser_test"][data-action="password"]');
  await fill("#new-vpn-password", "browser-test-password-new-private");
  await click('#vpn-account-form input[type="checkbox"]'); await click("#vpn-account-form button[type=submit]");
  await until('!document.querySelector("dialog") && document.querySelector("#vpn-refresh").disabled === false');
  await screenshot("accounts-desktop");
  await click('[data-account="browser_test"][data-action="delete"]'); await click("[data-confirm]");
  await until('!document.querySelector("dialog") && !document.querySelector(\'[data-account="browser_test"]\')');
  checks.push("Account create, search, disable/enable, reset/delete confirmations and escaped notes");
  for (const tab of ["sessions", "logs", "alerts"]) { await click(`[data-tab="${tab}"]`); await screenshot(tab + "-desktop"); }
  for (const width of [1280, 768]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const tab of ["overview", "accounts", "sessions", "logs", "alerts"]) {
      await click(`[data-tab="${tab}"]`);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${tab}@${width}`);
    }
  }
  await screenshot("alerts-tablet"); checks.push("All five sections fit laptop/tablet; tables scroll within their regions");
  if (portalMode) {
    for (const page of ["index.html", "news.html", "work.html", "department.html", "admin.html"]) {
      await visit(page);
      assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
      assert.equal(await evaluate('Boolean(document.querySelector(\'#profile-panel a[href="vpn-admin.html"]\'))'), true);
    }
    await visit("vpn-admin.html");
    checks.push("Existing website pages and shared ADMIN VPN navigation use real backend data");
  }
  await click("#vpn-logout");
  await until(portalMode ? 'Boolean(document.querySelector("#vpn-portal-login"))' : 'Boolean(document.querySelector("#vpn-login"))');
  checks.push(portalMode ? "Single website login and shared logout work across VPN dashboard" : "Temporary authentication compatibility works");
  assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(external, []);
  checks.push("No JavaScript errors, missing assets or external runtime requests");
  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks, errors, missing, external }, null, 2));
  console.log(checks.map(c => "PASS " + c).join("\n"));
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send("Browser.close"); } catch {} socket.close(); }
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error("Browser closed")); }
  if (chrome.exitCode === null) chrome.kill();
}
