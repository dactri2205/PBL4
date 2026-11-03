import { pool } from "../db/pool.js";
import { listProjects } from "./work-repository.js";

export async function getDepartment(user) {
  if (!user.departmentId) return null;

  const [departmentResult, membersResult, projects] = await Promise.all([
    pool.query(
      `SELECT id, name, code, description, goal,
              goal_description AS "goalDescription", progress
         FROM departments
        WHERE id = $1`,
      [user.departmentId],
    ),
    pool.query(
      `SELECT id, name,
              COALESCE(directory_job_title, job_title) AS job,
              photo_key AS photo
         FROM users
        WHERE department_id = $1 AND status = 'Active'
        ORDER BY is_department_lead DESC, name ASC`,
      [user.departmentId],
    ),
    listProjects(user),
  ]);

  const department = departmentResult.rows[0];
  if (!department) return null;

  return {
    ...department,
    members: membersResult.rows,
    projects: projects.filter(
      (project) => project.departmentId === user.departmentId,
    ),
  };
}
