import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";

const sessionLifetimeSeconds = 8 * 60 * 60;

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId, authVersion) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await pool.query("DELETE FROM auth_sessions WHERE expires_at <= now()");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT id FROM users WHERE id = $1 AND status = 'Active' AND auth_version = $2 FOR UPDATE",
      [userId, authVersion],
    );
    if (!current.rowCount) { await client.query("ROLLBACK"); return null; }
    await client.query(
      "INSERT INTO auth_sessions (token_hash, user_id, expires_at, auth_version) VALUES ($1, $2, $3, $4)",
      [tokenHash(token), userId, expiresAt, authVersion],
    );
    await client.query("COMMIT");
    return { token, expiresAt };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {}); throw error;
  } finally { client.release(); }
}

export async function getSessionUser(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ""))) return null;
  const hash = tokenHash(token);
  const result = await pool.query(
    `UPDATE auth_sessions AS s
       SET last_seen_at = now()
      FROM users AS u
      LEFT JOIN departments AS d ON d.id = u.department_id
     WHERE s.token_hash = $1
       AND s.user_id = u.id
       AND s.expires_at > now()
       AND u.status = 'Active'
       AND s.auth_version = u.auth_version
     RETURNING u.id, u.name, u.username, u.role, u.photo_key AS photo,
               u.department_id AS "departmentId",
               d.name AS "departmentName",
               u.job_title AS job, s.expires_at AS "sessionExpiresAt"`,
    [hash],
  );
  return result.rows[0] || null;
}

export async function deleteSession(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ""))) return;
  await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
    tokenHash(token),
  ]);
}

export { sessionLifetimeSeconds };
