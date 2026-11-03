import { createServer } from "node:http";
import { pool } from "./db/pool.js";
import { listAnnouncements } from "./repositories/announcement-repository.js";
import {
  getPublicDirectory,
  getPublicStatistics,
} from "./repositories/directory-repository.js";
import { getDepartment } from "./repositories/department-repository.js";
import {
  createAdminUser,
  listAdminDepartments,
  listAdminUsers,
  updateAdminUser,
  UserAdminError,
} from "./repositories/admin-user-repository.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./repositories/notification-repository.js";
import {
  getTask,
  listProjectPeople,
  listProjects,
  listTaskPeople,
  listTasks,
  updateTaskStatus,
} from "./repositories/work-repository.js";
import { authenticateUser } from "./auth/auth-service.js";
import {
  createSession,
  deleteSession,
  getSessionUser,
  sessionLifetimeSeconds,
} from "./auth/session-store.js";
import {
  changeOwnPassword,
  PasswordChangeError,
} from "./repositories/account-repository.js";

const port = Number(process.env.PORT || 3000);
const sessionCookieName =
  process.env.COOKIE_SECURE === "true" ? "__Host-avsid" : "avsid";
const secureCookie = process.env.COOKIE_SECURE === "true";
const loginAttempts = new Map();
const maxLoginAttempts = 5;
const loginWindowMs = 15 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function getSessionToken(req) {
  const prefix = `${sessionCookieName}=`;
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : "";
}

function sessionCookie(token, maxAge) {
  return `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie ? "; Secure" : ""}`;
}

function originIsAllowed(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== "string" || !origin || typeof host !== "string" || !host)
    return false;
  const proto = String(req.headers["x-forwarded-proto"] || "http")
    .split(",")[0]
    .trim();
  try {
    return new URL(origin).origin === new URL(`${proto}://${host}`).origin;
  } catch {
    return false;
  }
}

async function readJson(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    throw new HttpError(415, "Yêu cầu phải dùng JSON.");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > 16 * 1024)
      throw new HttpError(413, "Nội dung yêu cầu quá lớn.");
  }
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw 0;
    return value;
  } catch {
    throw new HttpError(400, "JSON không hợp lệ.");
  }
}

function loginRateLimited(username) {
  const key = username.toLocaleLowerCase("en");
  const attempt = loginAttempts.get(key);
  if (!attempt) return false;
  if (attempt.expiresAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return attempt.count >= maxLoginAttempts;
}

function recordLoginFailure(username) {
  const key = username.toLocaleLowerCase("en");
  const current = loginAttempts.get(key);
  if (!current || current.expiresAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, expiresAt: Date.now() + loginWindowMs });
  } else {
    current.count += 1;
  }
  if (loginAttempts.size > 5_000) {
    for (const [name, attempt] of loginAttempts)
      if (attempt.expiresAt <= Date.now()) loginAttempts.delete(name);
  }
}

async function requireSession(req, res) {
  const user = await getSessionUser(getSessionToken(req));
  if (!user) sendJson(res, 401, { error: "Cần đăng nhập để tiếp tục." });
  return user;
}

async function requireAdminSession(req, res) {
  const user = await requireSession(req, res);
  if (!user) return null;
  if (user.role !== "ADMIN") {
    sendJson(res, 403, { error: "Chỉ quản trị viên được phép thực hiện thao tác này." });
    return null;
  }
  return user;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      const body = await readJson(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (
        !/^[-a-zA-Z0-9_.]{3,32}$/.test(username) ||
        !password ||
        Buffer.byteLength(password, "utf8") > 1024
      ) {
        sendJson(res, 400, {
          error: "Vui lòng nhập tên đăng nhập và mật khẩu hợp lệ.",
        });
        return;
      }
      if (loginRateLimited(username)) {
        res.setHeader("Retry-After", String(Math.ceil(loginWindowMs / 1000)));
        sendJson(res, 429, {
          error: "Tạm khóa đăng nhập. Vui lòng thử lại sau 15 phút.",
        });
        return;
      }

      const user = await authenticateUser(username, password);
      if (!user) {
        recordLoginFailure(username);
        sendJson(res, 401, { error: "Tên đăng nhập hoặc mật khẩu không đúng." });
        return;
      }

      await deleteSession(getSessionToken(req));
      const session = await createSession(user.id);
      const authenticatedUser = await getSessionUser(session.token);
      res.setHeader(
        "Set-Cookie",
        sessionCookie(session.token, sessionLifetimeSeconds),
      );
      loginAttempts.delete(username.toLocaleLowerCase("en"));
      sendJson(res, 200, { data: authenticatedUser });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Login failed:", error.message);
      sendJson(res, 503, { error: "Dịch vụ đăng nhập hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      await deleteSession(getSessionToken(req));
      res.setHeader("Set-Cookie", sessionCookie("", 0));
      sendJson(res, 200, { data: { signedOut: true } });
    } catch (error) {
      console.error("Logout failed:", error.message);
      sendJson(res, 503, { error: "Dịch vụ đăng xuất hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      const body = await readJson(req);
      await changeOwnPassword(user.id, body.currentPassword, body.newPassword);
      sendJson(res, 200, { data: { changed: true, signedOut: true } });
    } catch (error) {
      if (error instanceof HttpError || error instanceof PasswordChangeError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Could not change password:", error.message);
      sendJson(res, 503, { error: "Dịch vụ đổi mật khẩu hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    try {
      const user = await getSessionUser(getSessionToken(req));
      if (!user) {
        sendJson(res, 401, { error: "Cần đăng nhập để tiếp tục." });
        return;
      }
      sendJson(res, 200, { data: user });
    } catch (error) {
      console.error("Could not load current user:", error.message);
      sendJson(res, 503, { error: "Dịch vụ tài khoản hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    try {
      await pool.query("SELECT 1");
      sendJson(res, 200, { status: "ok", service: "anviet-api", database: "ok" });
    } catch (error) {
      console.error("Database health check failed:", error.message);
      sendJson(res, 503, { status: "unavailable", service: "anviet-api" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/announcements") {
    try {
      const announcements = await listAnnouncements();
      sendJson(res, 200, { data: announcements });
    } catch (error) {
      console.error("Could not list announcements:", error.message);
      sendJson(res, 503, { error: "Dịch vụ dữ liệu hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/statistics") {
    try {
      const statistics = await getPublicStatistics();
      sendJson(res, 200, { data: statistics });
    } catch (error) {
      console.error("Could not load public statistics:", error.message);
      sendJson(res, 503, { error: "Dịch vụ dữ liệu hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/directory") {
    try {
      const directory = await getPublicDirectory();
      sendJson(res, 200, { data: directory });
    } catch (error) {
      console.error("Could not load public directory:", error.message);
      sendJson(res, 503, { error: "Dịch vụ dữ liệu hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      sendJson(res, 200, { data: await listProjects(user) });
    } catch (error) {
      console.error("Could not list projects:", error.message);
      sendJson(res, 503, { error: "Dịch vụ dự án hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/department") {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      sendJson(res, 200, { data: await getDepartment(user) });
    } catch (error) {
      console.error("Could not load department:", error.message);
      sendJson(res, 503, { error: "Dịch vụ phòng ban hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/departments") {
    try {
      const user = await requireAdminSession(req, res);
      if (!user) return;
      sendJson(res, 200, { data: await listAdminDepartments() });
    } catch (error) {
      console.error("Could not list admin departments:", error.message);
      sendJson(res, 503, { error: "Dịch vụ quản trị hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    try {
      const user = await requireAdminSession(req, res);
      if (!user) return;
      sendJson(res, 200, { data: await listAdminUsers() });
    } catch (error) {
      console.error("Could not list admin users:", error.message);
      sendJson(res, 503, { error: "Dịch vụ quản trị người dùng hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/users") {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      const actor = await requireAdminSession(req, res);
      if (!actor) return;
      const body = await readJson(req);
      const created = await createAdminUser(actor, body);
      sendJson(res, 201, { data: created });
    } catch (error) {
      if (error instanceof HttpError || error instanceof UserAdminError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Could not create user:", error.message);
      sendJson(res, 503, { error: "Dịch vụ quản trị người dùng hiện chưa sẵn sàng." });
    }
    return;
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === "PATCH" && adminUserMatch) {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      const actor = await requireAdminSession(req, res);
      if (!actor) return;
      const userId = decodeURIComponent(adminUserMatch[1]);
      const body = await readJson(req);
      const updated = await updateAdminUser(actor, userId, body);
      if (!updated) {
        sendJson(res, 404, { error: "Không tìm thấy tài khoản." });
        return;
      }
      sendJson(res, 200, { data: updated });
    } catch (error) {
      if (error instanceof HttpError || error instanceof UserAdminError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Could not update user:", error.message);
      sendJson(res, 503, { error: "Dịch vụ quản trị người dùng hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notifications") {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      sendJson(res, 200, { data: await listNotifications(user) });
    } catch (error) {
      console.error("Could not list notifications:", error.message);
      sendJson(res, 503, { error: "Dịch vụ thông báo hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/read-all") {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      await markAllNotificationsRead(user);
      sendJson(res, 200, { data: { updated: true } });
    } catch (error) {
      console.error("Could not mark all notifications read:", error.message);
      sendJson(res, 503, { error: "Dịch vụ thông báo hiện chưa sẵn sàng." });
    }
    return;
  }

  const notificationMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)$/);
  if (req.method === "PATCH" && notificationMatch) {
    if (!originIsAllowed(req)) {
      sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
      return;
    }
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      const body = await readJson(req);
      if (body.read !== true) {
        sendJson(res, 400, { error: "Chỉ hỗ trợ đánh dấu thông báo đã đọc." });
        return;
      }
      const notificationId = decodeURIComponent(notificationMatch[1]);
      const updated = await markNotificationRead(user, notificationId);
      if (!updated) {
        sendJson(res, 404, { error: "Không tìm thấy thông báo được phép cập nhật." });
        return;
      }
      sendJson(res, 200, { data: { updated: true } });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Could not mark notification read:", error.message);
      sendJson(res, 503, { error: "Dịch vụ thông báo hiện chưa sẵn sàng." });
    }
    return;
  }

  const projectPeopleMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/people$/);
  if (req.method === "GET" && projectPeopleMatch) {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      const projectId = decodeURIComponent(projectPeopleMatch[1]);
      const visibleProjects = await listProjects(user);
      if (!visibleProjects.some((project) => project.id === projectId)) {
        sendJson(res, 404, { error: "Không tìm thấy dự án được phép truy cập." });
        return;
      }
      sendJson(res, 200, {
        data: await listProjectPeople(user, projectId),
      });
    } catch (error) {
      console.error("Could not list project members:", error.message);
      sendJson(res, 503, { error: "Dịch vụ dự án hiện chưa sẵn sàng." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      sendJson(res, 200, { data: await listTasks(user) });
    } catch (error) {
      console.error("Could not list tasks:", error.message);
      sendJson(res, 503, { error: "Dịch vụ công việc hiện chưa sẵn sàng." });
    }
    return;
  }

  const taskPeopleMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/people$/);
  if (req.method === "GET" && taskPeopleMatch) {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      const taskId = decodeURIComponent(taskPeopleMatch[1]);
      if (!(await getTask(user, taskId))) {
        sendJson(res, 404, { error: "Không tìm thấy công việc được phép truy cập." });
        return;
      }
      sendJson(res, 200, { data: await listTaskPeople(user, taskId) });
    } catch (error) {
      console.error("Could not list task assignees:", error.message);
      sendJson(res, 503, { error: "Dịch vụ công việc hiện chưa sẵn sàng." });
    }
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && ["GET", "PATCH"].includes(req.method)) {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      const taskId = decodeURIComponent(taskMatch[1]);
      if (req.method === "GET") {
        const task = await getTask(user, taskId);
        if (!task) {
          sendJson(res, 404, { error: "Không tìm thấy công việc được phép truy cập." });
          return;
        }
        sendJson(res, 200, { data: task });
        return;
      }
      if (!originIsAllowed(req)) {
        sendJson(res, 403, { error: "Nguồn yêu cầu không được phép." });
        return;
      }
      const body = await readJson(req);
      if (!["Pending", "In Progress", "Completed"].includes(body.status)) {
        sendJson(res, 400, { error: "Trạng thái công việc không hợp lệ." });
        return;
      }
      const updated = await updateTaskStatus(user, taskId, body.status);
      if (!updated) {
        sendJson(res, 404, { error: "Không tìm thấy công việc được phép cập nhật." });
        return;
      }
      sendJson(res, 200, { data: { updated: true } });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Could not access task:", error.message);
      sendJson(res, 503, { error: "Dịch vụ công việc hiện chưa sẵn sàng." });
    }
    return;
  }

  sendJson(res, 404, { error: "Không tìm thấy tài nguyên." });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`An Việt API listening on port ${port}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timeout);
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
