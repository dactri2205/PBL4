import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { writeAuditLog } from "./audit-repository.js";

export class PasswordChangeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function changeOwnPassword(userId, currentPassword, newPassword) {
  if (
    typeof currentPassword !== "string" ||
    !currentPassword ||
    Buffer.byteLength(currentPassword, "utf8") > 1024
  )
    throw new PasswordChangeError(400, "Mật khẩu hiện tại không hợp lệ.");
  if (
    typeof newPassword !== "string" ||
    Array.from(newPassword).length < 12 ||
    Buffer.byteLength(newPassword, "utf8") > 1024
  )
    throw new PasswordChangeError(
      400,
      "Mật khẩu mới cần ít nhất 12 ký tự và không quá 1024 byte.",
    );
  if (currentPassword === newPassword)
    throw new PasswordChangeError(
      400,
      "Mật khẩu mới phải khác mật khẩu hiện tại.",
    );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT password_hash FROM users
        WHERE id = $1 AND status = 'Active'
        FOR UPDATE`,
      [userId],
    );
    const encodedPassword = result.rows[0]?.password_hash;
    if (!encodedPassword || !(await verifyPassword(currentPassword, encodedPassword)))
      throw new PasswordChangeError(400, "Mật khẩu hiện tại không đúng.");

    const passwordHash = await hashPassword(newPassword);
    await client.query(
      `UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = now() WHERE id = $1`,
      [userId, passwordHash],
    );
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
    await writeAuditLog(client, {
      actorId: userId,
      action: "user.password_changed",
      entityType: "user",
      entityId: userId,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function setUserPassword(username, password) {
  if (typeof password !== "string" || Array.from(password).length < 12 || Buffer.byteLength(password, "utf8") > 1024)
    throw new PasswordChangeError(400, "Mật khẩu cần ít nhất 12 ký tự và không quá 1024 byte.");
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = now()
       WHERE lower(username) = lower($1) AND status = 'Active' RETURNING id, username`,
      [username, passwordHash],
    );
    if (result.rowCount !== 1) throw new PasswordChangeError(404, "Không tìm thấy tài khoản đang hoạt động với username đó.");
    const user = result.rows[0];
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [user.id]);
    await writeAuditLog(client, { actorId: null, action: "user.password_reset", entityType: "user", entityId: user.id });
    await client.query("COMMIT");
    return user.username;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
