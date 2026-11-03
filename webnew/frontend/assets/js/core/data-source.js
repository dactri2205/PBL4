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
async function requestApi(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw Error("Không kết nối được API. Hãy kiểm tra dịch vụ rồi tải lại trang.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("Phản hồi API không hợp lệ.");
  }
  if (!response.ok)
    throw Error((typeof result.error === "string" ? result.error : result.error?.message) || "Máy chủ chưa thể cung cấp dữ liệu.");
  if (!Object.hasOwn(result || {}, "data"))
    throw Error("Phản hồi API thiếu trường dữ liệu.");
  return result.data;
}
// Preview routes use local mock state; normal sessions call the server API.
export const api = {
  async getCurrentUser() {
    if (isPreview()) return structuredClone(current());
    let response;
    try {
      response = await fetch("/api/me", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
    } catch {
      return null;
    }
    if (response.status === 401) return null;
    if (!response.ok) throw Error("Không thể kiểm tra phiên đăng nhập.");
    const result = await response.json();
    return result?.data ? structuredClone(result.data) : null;
  },
  async login(username, password) {
    if (isPreview()) throw Error("Hãy thoát chế độ xem thử trước khi đăng nhập.");
    return structuredClone(
      await requestApi("/api/auth/login", {
        method: "POST",
        body: { username, password },
      }),
    );
  },
  async logout() {
    if (isPreview()) return;
    await requestApi("/api/auth/logout", { method: "POST" });
  },
  async changePassword(currentPassword, newPassword) {
    if (isPreview())
      throw Error("Đổi mật khẩu chỉ dùng được với tài khoản đăng nhập thật.");
    return structuredClone(
      await requestApi("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      }),
    );
  },
  async getAnnouncements() {
    if (isPreview()) return structuredClone(seed.announcements);
    const data = await requestApi("/api/announcements");
    if (!Array.isArray(data)) throw Error("Dữ liệu bản tin không đúng định dạng.");
    return structuredClone(data);
  },
  async getStatistics() {
    const counts = isPreview()
      ? {
          members: companyDirectory().members.length,
          departments: seed.departments.length,
        }
      : await requestApi("/api/statistics");
    if (
      !Number.isInteger(counts?.members) ||
      !Number.isInteger(counts?.departments)
    )
      throw Error("Dữ liệu thống kê không đúng định dạng.");
    return structuredClone(
      seed.statistics.map((s) => ({
        ...s,
        value: s.action
          ? String(
              s.action === "members" ? counts.members : counts.departments,
            ).padStart(2, "0")
          : s.value,
      })),
    );
  },
  async getCompanyDirectory() {
    if (isPreview()) return structuredClone(companyDirectory());
    const directory = await requestApi("/api/directory");
    if (
      !Array.isArray(directory?.members) ||
      !Array.isArray(directory?.departments)
    )
      throw Error("Dữ liệu danh bạ không đúng định dạng.");
    return structuredClone(directory);
  },
  async getDepartments() {
    if (!isPreview()) {
      const departments = await requestApi("/api/admin/departments");
      if (!Array.isArray(departments))
        throw Error("Dữ liệu phòng ban không đúng định dạng.");
      return structuredClone(departments);
    }
    return current() ? structuredClone(seed.departments) : [];
  },
  async getDepartment() {
    if (!isPreview())
      return structuredClone(await requestApi("/api/department"));
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
    return structuredClone(
      isPreview()
        ? permittedProjects()
        : await requestApi("/api/projects"),
    );
  },
  async getTasks() {
    return structuredClone(
      isPreview() ? permittedTasks() : await requestApi("/api/tasks"),
    );
  },
  async getTask(id) {
    if (isPreview())
      return structuredClone(permittedTasks().find((t) => t.id === id) || null);
    return structuredClone(
      await requestApi(`/api/tasks/${encodeURIComponent(id)}`),
    );
  },
  async getNotifications() {
    if (!isPreview()) {
      const notifications = await requestApi("/api/notifications");
      if (!Array.isArray(notifications))
        throw Error("Dữ liệu thông báo không đúng định dạng.");
      return structuredClone(notifications);
    }
    const u = current();
    return structuredClone(
      u ? state.notifications.filter((n) => n.userId === u.id) : [],
    );
  },
  async markRead(id) {
    if (!isPreview()) {
      if (id === "all") {
        await requestApi("/api/notifications/read-all", { method: "POST" });
      } else {
        await requestApi(`/api/notifications/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: { read: true },
        });
      }
      return;
    }
    const u = requireUser();
    state.notifications
      .filter((n) => n.userId === u.id && (id === "all" || n.id === id))
      .forEach((n) => (n.read = true));
    save();
  },
  async updateTask(id, status) {
    if (!isPreview()) {
      await requestApi(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { status },
      });
      return;
    }
    requireUser();
    if (!["Pending", "In Progress", "Completed"].includes(status))
      throw Error("Trạng thái không hợp lệ.");
    const task = permittedTasks().find((t) => t.id === id);
    if (!task) throw Error("Không tìm thấy công việc được phân công.");
    task.status = status;
    save();
  },
  async getTaskPeople(taskId) {
    if (!isPreview())
      return structuredClone(
        await requestApi(
          `/api/tasks/${encodeURIComponent(taskId)}/people`,
        ),
      );
    const task = permittedTasks().find((t) => t.id === taskId);
    return structuredClone(
      task ? state.users.filter((u) => task.assignees.includes(u.id)) : [],
    );
  },
  async getProjectPeople(projectId) {
    if (!isPreview())
      return structuredClone(
        await requestApi(
          `/api/projects/${encodeURIComponent(projectId)}/people`,
        ),
      );
    const p = permittedProjects().find((p) => p.id === projectId);
    return structuredClone(
      p ? state.users.filter((u) => p.members.includes(u.id)) : [],
    );
  },
  async getUsers() {
    if (!isPreview()) {
      const users = await requestApi("/api/admin/users");
      if (!Array.isArray(users))
        throw Error("Dữ liệu tài khoản không đúng định dạng.");
      return structuredClone(users);
    }
    requireAdmin();
    return structuredClone(state.users);
  },
  async updateUser(id, changes) {
    if (!isPreview()) {
      return structuredClone(
        await requestApi(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: changes,
        }),
      );
    }
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
    if (!isPreview())
      return structuredClone(
        await requestApi("/api/admin/users", {
          method: "POST",
          body: values,
        }),
      );
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
