import { pool } from "../db/pool.js";

export async function listNotifications(user) {
  const result = await pool.query(
    `SELECT id, title,
            to_char(notification_date, 'YYYY-MM-DD') AS date,
            task_id AS "taskId", is_read AS read
       FROM notifications
      WHERE user_id = $1
      ORDER BY notification_date DESC, created_at DESC, id DESC
      LIMIT 50`,
    [user.id],
  );
  return result.rows;
}

export async function markNotificationRead(user, notificationId) {
  const result = await pool.query(
    `UPDATE notifications
        SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [notificationId, user.id],
  );
  return result.rowCount === 1;
}

export async function markAllNotificationsRead(user) {
  await pool.query(
    `UPDATE notifications
        SET is_read = true
      WHERE user_id = $1 AND is_read = false`,
    [user.id],
  );
}
