import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";
import { verifyPassword, hashPassword } from "./password.js";

const dummyHash = await hashPassword(randomBytes(32).toString("hex"));

export async function authenticateUser(username, password) {
  const result = await pool.query(
    `SELECT id, password_hash, status, auth_version AS "authVersion"
       FROM users
      WHERE lower(username) = lower($1)
      LIMIT 1`,
    [username],
  );
  const user = result.rows[0];
  const matches = await verifyPassword(
    password,
    user?.password_hash || dummyHash,
  );
  return user && user.status === "Active" && user.password_hash && matches
    ? user
    : null;
}
