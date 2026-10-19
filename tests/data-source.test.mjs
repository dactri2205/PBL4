import { test } from "node:test";
import assert from "node:assert/strict";
const memory = new Map();
globalThis.location = { search: "?demo=1" };
globalThis.sessionStorage = {
  getItem: (k) => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const { api } = await import("../frontend/assets/js/core/data-source.js");
const select = (id) => {
  if (id) memory.set("preview-user", id);
  else memory.delete("preview-user");
};
test("guest receives public information but no private records", async () => {
  select(null);
  assert.ok((await api.getAnnouncements()).length);
  assert.equal((await api.getStatistics()).length, 4);
  assert.deepEqual(await api.getTasks(), []);
  assert.deepEqual(await api.getProjects(), []);
  assert.deepEqual(await api.getNotifications(), []);
  assert.equal(await api.getDepartment(), null);
  await assert.rejects(api.getUsers());
});
test("same-department employees have different project/task scopes", async () => {
  select("minh");
  const a = await api.getDepartment(),
    tasksA = await api.getTasks();
  assert.deepEqual(
    (await api.getProjects()).map((p) => p.id),
    ["alpha"],
  );
  assert.equal(await api.getTask("t5"), null);
  await assert.rejects(api.updateTask("t5", "Completed"));
  select("linh");
  const b = await api.getDepartment();
  assert.equal(a.id, b.id);
  assert.deepEqual(
    (await api.getProjects()).map((p) => p.id),
    ["beta"],
  );
  assert.ok(
    (await api.getTasks()).every((t) => !tasksA.some((a) => a.id === t.id)),
  );
  assert.equal(await api.getTask("t1"), null);
});
test("public directory exposes only profiles and keeps KPI counts consistent", async () => {
  select(null);
  const directory = await api.getCompanyDirectory();
  const stats = await api.getStatistics();
  assert.equal(directory.members.length, 9);
  assert.equal(directory.departments.length, 2);
  assert.equal(directory.members.filter((u) => u.isLeader).length, 5);
  assert.equal(
    Number(stats.find((s) => s.action === "members").value),
    directory.members.length,
  );
  assert.equal(
    Number(stats.find((s) => s.action === "departments").value),
    directory.departments.length,
  );
  assert.ok(!directory.members.some((u) => u.id === "phuc"));
  for (const member of directory.members) {
    assert.deepEqual(
      Object.keys(member).sort(),
      [
        "departmentId",
        "departmentName",
        "id",
        "isLeader",
        "job",
        "name",
        "photo",
      ].sort(),
    );
  }
  for (const department of directory.departments) {
    assert.equal(
      department.memberCount,
      directory.members.filter((u) => u.departmentId === department.id).length,
    );
    assert.ok(!("projects" in department));
  }
  // Being a department head does not imply an ADMIN application role.
  select("ha");
  assert.equal((await api.getCurrentUser()).role, "EMPLOYEE");
  assert.equal(directory.members.find((u) => u.id === "ha").isLeader, true);
});
test("task state validates workflow and persists only preview data", async () => {
  select("minh");
  await assert.rejects(api.updateTask("t1", "Overdue"));
  await api.updateTask("t1", "Completed");
  assert.equal((await api.getTask("t1")).status, "Completed");
  assert.ok(memory.has("preview-data-v1"));
});
test("notifications are personal and marking read updates counts", async () => {
  select("minh");
  await api.markRead("all");
  assert.ok((await api.getNotifications()).every((n) => n.read));
  select("linh");
  assert.ok((await api.getNotifications()).some((n) => !n.read));
});
test("employee cannot access or mutate user management", async () => {
  select("linh");
  await assert.rejects(api.getUsers());
  await assert.rejects(api.updateUser("minh", { role: "ADMIN" }));
  await assert.rejects(api.createUser({ name: "Test", username: "test" }));
});
test("admin can update distinct role and department without granting assignments", async () => {
  select("admin");
  const list = await api.getUsers();
  assert.equal(list.length, 7);
  const minh = list.find((u) => u.id === "minh");
  await api.updateUser("minh", { ...minh, departmentId: "hr" });
  select("minh");
  assert.equal((await api.getDepartment()).id, "hr");
  assert.equal((await api.getCurrentUser()).role, "EMPLOYEE");
  assert.deepEqual(
    (await api.getProjects()).map((p) => p.id),
    ["alpha"],
  );
});
test("disabled preview account has no private data", async () => {
  select("admin");
  const linh = (await api.getUsers()).find((u) => u.id === "linh");
  await api.updateUser("linh", { ...linh, status: "Disabled" });
  select("linh");
  assert.equal(await api.getCurrentUser(), null);
  assert.deepEqual(await api.getTasks(), []);
  const directory = await api.getCompanyDirectory();
  assert.ok(!directory.members.some((u) => u.id === "linh"));
  assert.equal(
    Number(
      (await api.getStatistics()).find((s) => s.action === "members").value,
    ),
    directory.members.length,
  );
});
test("admin account protection, duplicate checks and honest empty state", async () => {
  select("admin");
  const self = (await api.getUsers()).find((u) => u.id === "admin");
  await assert.rejects(api.updateUser("admin", { ...self, role: "EMPLOYEE" }));
  await assert.rejects(
    api.createUser({
      name: "Trùng tên",
      username: "quangminh",
      role: "EMPLOYEE",
      departmentId: "it",
    }),
  );
  await api.createUser({
    name: "Thành viên kiểm thử",
    username: "test.new",
    role: "EMPLOYEE",
    departmentId: "hr",
  });
  assert.equal((await api.getUsers()).length, 8);
  select("mai");
  assert.deepEqual(await api.getTasks(), []);
});
