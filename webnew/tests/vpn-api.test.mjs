import test from "node:test";
import assert from "node:assert/strict";
import { createVpnApi, VpnApiError } from "../frontend/assets/js/services/vpn-api.js";

const reply = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
test("VPN adapter refreshes CSRF after server login, uses same-origin credentials and never stores passwords", async () => {
  const requests = [];
  let authenticated = false;
  const api = createVpnApi({ fetchImpl: async (url, options) => {
    requests.push([url, options]);
    if (url.endsWith("auth/session")) return reply({ authenticated, isAdmin: authenticated, csrfToken: authenticated ? "signed-in-csrf" : "anonymous-csrf" });
    if (url.endsWith("auth/login")) { assert.equal(options.headers["X-CSRF-Token"], "anonymous-csrf"); authenticated = true; return reply({ authenticated }); }
    return reply(null, 204);
  } });
  await api.session();
  assert.equal((await api.login("operator", "test-private-password")).isAdmin, true);
  await api.resetPassword("alice", "new-private-password");
  const reset = requests.at(-1);
  assert.equal(reset[0], "/api/vpn/accounts/alice/password");
  assert.equal(reset[1].headers["X-CSRF-Token"], "signed-in-csrf");
  assert.deepEqual(JSON.parse(reset[1].body), { password: "new-private-password" });
  assert.ok(requests.every(([url, options]) => url.startsWith("/api/vpn/") && options.credentials === "same-origin" && options.cache === "no-store"));
  assert.ok(!("Authorization" in reset[1].headers));
  await api.logout();
});
test("API errors preserve 401/403/503 and correlation ID without mock fallback or retrying mutations", async () => {
  for (const status of [400, 401, 403, 409, 429, 503, 504]) {
    let calls = 0;
    const api = createVpnApi({ fetchImpl: async () => { calls++; return reply({ error: { code: "real-error", message: "server refused", correlationId: "trace-1" } }, status); } });
    await assert.rejects(api.createAccount({ username: "alice", password: "private-password" }), error =>
      error instanceof VpnApiError && error.status === status && error.correlationId === "trace-1");
    assert.equal(calls, 1);
  }
});
test("offline, invalid JSON and timeout stay explicit errors", async () => {
  const offline = createVpnApi({ fetchImpl: async () => { throw new TypeError("network unavailable"); } });
  await assert.rejects(offline.overview(), error => error.code === "offline" && error.status === 0);
  const invalid = createVpnApi({ fetchImpl: async () => new Response("<html>not an API</html>") });
  await assert.rejects(invalid.accounts(), error => error.code === "invalid_response");
  const timeout = createVpnApi({ timeoutMs: 10, fetchImpl: (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })) });
  await assert.rejects(timeout.sessions(), error => error.code === "timeout");
});
test("log filters are encoded, account paths cannot escape routing and remote API bases are rejected", async () => {
  const calls = [];
  const api = createVpnApi({ basePath: "/api/vpn/", fetchImpl: async (url) => { calls.push(url); return reply({ items: [], total: 0 }); } });
  await api.logs({ username: "a&role=admin", eventType: "login", page: 2, pageSize: 25, outcome: "" });
  const query = new URL(calls.at(-1), "http://example.test").searchParams;
  assert.equal(query.get("username"), "a&role=admin"); assert.equal(query.get("role"), null); assert.equal(query.get("outcome"), null);
  await api.deleteAccount("alice/bob"); assert.ok(calls.at(-1).endsWith("alice%2Fbob"));
  for (const basePath of ["https://other.test", "//other.test", "/api\\other", "/api?url=remote"])
    assert.throws(() => createVpnApi({ basePath }));
});
