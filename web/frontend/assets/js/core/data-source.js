import * as seed from "../data/mock-data.js";
import { getSessionId, isPreview } from "./demo-session.js";
const key = "preview-data-v1";
let state = structuredClone({
  users: seed.users,
  tasks: seed.tasks,
  notifications: seed.notifications,
});
try {
  if (isPreview()) {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (saved?.users?.length && saved?.tasks && saved?.notifications)
      state = saved;
  }
} catch {}
function save() {
  if (!isPreview())
    throw Error("Chỉ có thể cập nhật trong Development Preview.");
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {}
}
function current() {
  return (
    state.users.find((u) => u.id === getSessionId() && u.status === "Active") ||
    null
  );
}
function requireUser() {
  const user = current();
  if (!user) throw Error("Vui lòng chọn người dùng mẫu.");
  return user;
}
function requireAdmin() {
  const user = requireUser();
  if (user.role !== "ADMIN")
    throw Error("Giao diện này dành cho quản trị viên mẫu.");
  return user;
}
function permittedProjects() {
  const u = current();
  return u
    ? seed.projects.filter(
        (p) => u.role === "ADMIN" || p.members.includes(u.id),
      )
    : [];
}
function permittedTasks() {
  const u = current();
  return u
    ? state.tasks.filter(
        (t) => u.role === "ADMIN" || t.assignees.includes(u.id),
      )
    : [];
}
function companyDirectory() {
  const people = [
    ...seed.directoryProfiles,
    ...state.users.filter((u) => u.status === "Active"),
  ];
  // Explicit public projection: no usernames, auth roles, account status or assignments.
  const members = people.map((u) => ({
    id: u.id,
    name: u.name,
    job: seed.directoryJobTitles[u.id] || u.job,
    departmentId: u.departmentId,
    departmentName:
      seed.departments.find((d) => d.id === u.departmentId)?.name ||
      "Ban điều hành",
    photo: u.photo,
    isLeader: u.isLeader === true || seed.leadershipUserIds.includes(u.id),
  }));
  return {
    members,
    departments: seed.departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      description: d.description,
      memberCount: members.filter((u) => u.departmentId === d.id).length,
    })),
  };
}
// Async facade: replace internals with authenticated HTTP calls when Backend is available.
export const api = {
  async getCurrentUser() {
    return structuredClone(current());
  },
  async getAnnouncements() {
    return structuredClone(seed.announcements);
  },
  async getStatistics() {
    const directory = companyDirectory();
    return structuredClone(
      seed.statistics.map((s) => ({
        ...s,
        value: s.action
          ? String(
              s.action === "members"
                ? directory.members.length
                : directory.departments.length,
            ).padStart(2, "0")
          : s.value,
      })),
    );
  },
  async getCompanyDirectory() {
    return structuredClone(companyDirectory());
  },
  async getDepartments() {
    return current() ? structuredClone(seed.departments) : [];
  },
  async getDepartment() {
    const u = current();
    if (!u) return null;
    const dep = seed.departments.find((d) => d.id === u.departmentId);
    if (!dep) return null;
    return structuredClone({
      ...dep,
      members: state.users.filter(
        (m) => m.departmentId === dep.id && m.status === "Active",
      ),
      projects: permittedProjects().filter((p) => p.departmentId === dep.id),
    });
  },
  async getProjects() {
    return structuredClone(permittedProjects());
  },
  async getTasks() {
    return structuredClone(permittedTasks());
  },
  async getTask(id) {
    return structuredClone(permittedTasks().find((t) => t.id === id) || null);
  },
  async getNotifications() {
    const u = current();
    return structuredClone(
      u ? state.notifications.filter((n) => n.userId === u.id) : [],
    );
  },
  async markRead(id) {
    const u = requireUser();
    state.notifications
      .filter((n) => n.userId === u.id && (id === "all" || n.id === id))
      .forEach((n) => (n.read = true));
    save();
  },
  async updateTask(id, status) {
    requireUser();
    if (!["Pending", "In Progress", "Completed"].includes(status))
      throw Error("Trạng thái không hợp lệ.");
    const task = permittedTasks().find((t) => t.id === id);
    if (!task) throw Error("Không tìm thấy công việc được phân công.");
    task.status = status;
    save();
  },
  async getTaskPeople(taskId) {
    const task = permittedTasks().find((t) => t.id === taskId);
    return structuredClone(
      task ? state.users.filter((u) => task.assignees.includes(u.id)) : [],
    );
  },
  async getProjectPeople(projectId) {
    const p = permittedProjects().find((p) => p.id === projectId);
    return structuredClone(
      p ? state.users.filter((u) => p.members.includes(u.id)) : [],
    );
  },
  async getUsers() {
    requireAdmin();
    return structuredClone(state.users);
  },
  async updateUser(id, changes) {
    const admin = requireAdmin();
    const u = state.users.find((u) => u.id === id);
    if (!u) throw Error("Không tìm thấy người dùng.");
    if (
      !["ADMIN", "EMPLOYEE"].includes(changes.role) ||
      !["Active", "Disabled"].includes(changes.status) ||
      !seed.departments.some((d) => d.id === changes.departmentId)
    )
      throw Error("Thông tin tài khoản không hợp lệ.");
    if (
      id === admin.id &&
      (changes.role !== "ADMIN" || changes.status !== "Active")
    )
      throw Error(
        "Giữ tài khoản quản trị hiện tại hoạt động để tiếp tục phiên xem thử.",
      );
    Object.assign(u, {
      name:
        String(changes.name || "")
          .trim()
          .slice(0, 80) || u.name,
      role: changes.role,
      departmentId: changes.departmentId,
      status: changes.status,
    });
    save();
  },
  async createUser(values) {
    requireAdmin();
    const name = String(values.name || "").trim();
    const username = String(values.username || "").trim();
    if (!name || !/^[-a-zA-Z0-9_.]{3,32}$/.test(username))
      throw Error(
        "Tên đăng nhập cần 3–32 ký tự chữ không dấu, số, dấu chấm, gạch nối hoặc gạch dưới.",
      );
    if (
      state.users.some(
        (u) => u.username.toLowerCase() === username.toLowerCase(),
      )
    )
      throw Error("Tên đăng nhập đã có trong dữ liệu mẫu.");
    if (
      !["ADMIN", "EMPLOYEE"].includes(values.role) ||
      !seed.departments.some((d) => d.id === values.departmentId)
    )
      throw Error("Vai trò hoặc phòng ban không hợp lệ.");
    state.users.push({
      id: crypto.randomUUID(),
      name: name.slice(0, 80),
      username,
      role: values.role,
      departmentId: values.departmentId,
      status: "Active",
      job: "Thành viên mới",
      photo: null,
    });
    save();
  },
  async reset() {
    requireAdmin();
    try {
      sessionStorage.removeItem(key);
    } catch {}
    location.reload();
  },
};
