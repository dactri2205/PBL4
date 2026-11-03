import { pool } from "../db/pool.js";

export async function listAnnouncements() {
  const result = await pool.query(`
    SELECT
      id,
      title,
      category,
      to_char(published_on, 'YYYY-MM-DD') AS date,
      summary,
      body
    FROM announcements
    ORDER BY published_on DESC, id ASC
  `);

  return result.rows;
}
