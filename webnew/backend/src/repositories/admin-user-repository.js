import { pool } from "../db/pool.js";
import { writeAuditLog } from "./audit-repository.js";

export class UserAdminError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const userProjection = `u.id, u.name, u.username, u.role,
  u.department_id AS "departmentId", u.job_title AS job,
  u.status, u.photo_key AS photo`;
const returningUser = `id, name, username, role,
  department_id AS "departmentId", job_title AS job,
  status, photo_key AS photo`;

export async function listAdminDepartments() {
  const result = await pool.query(
    `SELECT id, name, code FROM departments ORDER BY name, id`,
  );
  return result.rows;
}

export async function listAdminUsers() {
  const result = await pool.query(
    `SELECT ${userProjection} FROM users u ORDER BY u.name, u.username`,
  );
  return result.rows;
}

export async function createAdminUser(actor, { name, username, role, departmentId }) {
  const cleanName = String(name || "").trim();
  const cleanUsername = String(username || "").trim();
  if (!cleanName || Array.from(cleanName).length > 80)
    throw new UserAdminError(400, "Họ tên cần có từ 1 đến 80 ký tự.");
  if (!/^[-a-zA-Z0-9_.]{3,32}$/.test(cleanUsername))
    throw new UserAdminError(400, "Tên đăng nhập không đúng định dạng.");
  if (!["ADMIN", "EMPLOYEE"].includes(role))
    throw new UserAdminError(400, "Vai trò không hợp lệ.");
  if (!departmentId || typeof departmentId !== "string")
    throw new UserAdminError(400, "Vui lòng chọn phòng ban.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users
         (id, name, username, role, department_id, job_title, status)
       SELECT gen_random_uuid()::text, $1, $2, $3, d.id, 'Thành viên mới', 'Active'
         FROM departments d
        WHERE d.id = $4
       RETURNING ${returningUser}`,
      [cleanName, cleanUsername, role, departmentId],
    );
    if (!result.rowCount)
      throw new UserAdminError(400, "Phòng ban đã chọn không tồn tại.");
    const created = result.rows[0];
    await writeAuditLog(client, {
      actorId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: created.id,
      details: { username: cleanUsername, role, departmentId },
    });
    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof UserAdminError) throw error;
    if (error.code === "23505")
      throw new UserAdminError(409, "Tên đăng nhập đã được sử dụng.");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminUser(actor, userId, changes) {
  const name = String(changes.name || "").trim();
  if (!name || Array.from(name).length > 80)
    throw new UserAdminError(400, "Họ tên cần có từ 1 đến 80 ký tự.");
  if (!["ADMIN", "EMPLOYEE"].includes(changes.role))
    throw new UserAdminError(400, "Vai trò không hợp lệ.");
  if (!["Active", "Disabled"].includes(changes.status))
    throw new UserAdminError(400, "Trạng thái tài khoản không hợp lệ.");
  if (!changes.departmentId || typeof changes.departmentId !== "string")
    throw new UserAdminError(400, "Vui lòng chọn phòng ban.");
  if (actor.id === userId && (changes.role !== "ADMIN" || changes.status !== "Active"))
    throw new UserAdminError(409, "Không thể hạ quyền hoặc vô hiệu hóa tài khoản đang đăng nhập.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const admins = await client.query(
      `SELECT id FROM users
        WHERE role = 'ADMIN' AND status = 'Active'
        ORDER BY id FOR UPDATE`,
    );
    const current = await client.query(
      `SELECT id, name, role, department_id AS "departmentId", status
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    const target = current.rows[0];
    const staysActiveAdmin = changes.role === "ADMIN" && changes.status === "Active";
    if (
      target.role === "ADMIN" &&
      target.status === "Active" &&
      !staysActiveAdmin &&
      admins.rowCount <= 1
    )
      throw new UserAdminError(409, "Cần giữ lại ít nhất một quản trị viên đang hoạt động.");

    const department = await client.query(
      `SELECT id FROM departments WHERE id = $1`,
      [changes.departmentId],
    );
    if (!department.rowCount)
      throw new UserAdminError(400, "Phòng ban đã chọn không tồn tại.");

    const result = await client.query(
      `UPDATE users
          SET name = $2, role = $3, department_id = $4, status = $5,
              auth_version = auth_version + CASE WHEN role IS DISTINCT FROM $3 OR status IS DISTINCT FROM $5 THEN 1 ELSE 0 END,
              updated_at = now()
        WHERE id = $1
        RETURNING ${returningUser}`,
      [userId, name, changes.role, changes.departmentId, changes.status],
    );
    const changedFields = {};
    if (target.name !== name) changedFields.name = { from: target.name, to: name };
    if (target.role !== changes.role)
      changedFields.role = { from: target.role, to: changes.role };
    if (target.departmentId !== changes.departmentId)
      changedFields.departmentId = {
        from: target.departmentId,
        to: changes.departmentId,
      };
    if (target.status !== changes.status)
      changedFields.status = { from: target.status, to: changes.status };
    if (Object.keys(changedFields).length)
      await writeAuditLog(client, {
        actorId: actor.id,
        action: "user.updated",
        entityType: "user",
        entityId: userId,
        details: { changes: changedFields },
      });
    if (changes.status === "Disabled" || target.role !== changes.role)
      await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
