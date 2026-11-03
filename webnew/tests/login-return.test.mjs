import test from "node:test";
import assert from "node:assert/strict";
import { loginReturnTarget } from "../frontend/assets/js/core/login-return.js";
test("login only returns to approved local pages", () => {
  assert.equal(loginReturnTarget("?returnTo=vpn-admin.html"), "vpn-admin.html");
  assert.equal(loginReturnTarget("?returnTo=work.html"), "work.html");
  for (const target of ["https://evil.test", "//evil.test", "javascript:alert(1)", "../vpn-admin.html", "/vpn-admin.html", "vpn-admin.html?role=ADMIN"])
    assert.equal(loginReturnTarget(`?returnTo=${encodeURIComponent(target)}`), "index.html");
});
