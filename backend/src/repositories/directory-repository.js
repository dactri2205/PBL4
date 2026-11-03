import { pool } from "../db/pool.js";

export async function getPublicDirectory() {
  const [membersResult, departmentsResult] = await Promise.all([
    pool.query(`
      SELECT
        u.id,
        u.name,
        COALESCE(u.directory_job_title, u.job_title) AS job,
        u.department_id AS "departmentId",
        COALESCE(d.name, 'Ban điều hành') AS "departmentName",
        u.photo_key AS photo,
        u.is_department_lead AS "isLeader"
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.status = 'Active'

      UNION ALL

      SELECT
        p.id,
        p.name,
        p.job_title AS job,
        p.department_id AS "departmentId",
        COALESCE(d.name, 'Ban điều hành') AS "departmentName",
        p.photo_key AS photo,
        p.is_leader AS "isLeader"
      FROM directory_profiles p
      LEFT JOIN departments d ON d.id = p.department_id
      ORDER BY "isLeader" DESC, name ASC
    `),
    pool.query(`
      SELECT
        d.id,
        d.name,
        d.code,
        d.description,
        COUNT(u.id)::int AS "memberCount"
      FROM departments d
      LEFT JOIN users u
        ON u.department_id = d.id
       AND u.status = 'Active'
      GROUP BY d.id
      ORDER BY d.name ASC
    `),
  ]);

  return {
    members: membersResult.rows,
    departments: departmentsResult.rows,
  };
}

export async function getPublicStatistics() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE status = 'Active') +
      (SELECT COUNT(*)::int FROM directory_profiles) AS members,
      (SELECT COUNT(*)::int FROM departments) AS departments
  `);
  return result.rows[0];
}
