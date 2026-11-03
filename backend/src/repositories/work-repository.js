import { pool } from "../db/pool.js";
import { writeAuditLog } from "./audit-repository.js";

export async function listProjects(user) {
  const result = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.code,
       p.department_id AS "departmentId",
       p.description,
       p.status,
       p.progress,
       to_char(p.due_date, 'YYYY-MM-DD') AS due,
       COALESCE(
         array_agg(DISTINCT pm.user_id ORDER BY pm.user_id)
           FILTER (WHERE pm.user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS members
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id
     WHERE $1 = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM project_members own
           WHERE own.project_id = p.id AND own.user_id = $2
        )
     GROUP BY p.id
     ORDER BY p.due_date NULLS LAST, p.id`,
    [user.role, user.id],
  );
  return result.rows;
}

export async function listTasks(user) {
  const result = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.description,
       t.project_id AS "projectId",
       t.status,
       t.priority,
       to_char(t.due_date, 'YYYY-MM-DD') AS due,
       to_char(t.created_at::date, 'YYYY-MM-DD') AS created,
       COALESCE(
         array_agg(DISTINCT a.user_id ORDER BY a.user_id)
           FILTER (WHERE a.user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS assignees
     FROM tasks t
     LEFT JOIN task_assignees a ON a.task_id = t.id
     WHERE $1 = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM task_assignees own
           WHERE own.task_id = t.id AND own.user_id = $2
        )
     GROUP BY t.id
     ORDER BY t.due_date NULLS LAST, t.id`,
    [user.role, user.id],
  );
  return result.rows;
}

export async function getTask(user, taskId) {
  const result = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.description,
       t.project_id AS "projectId",
       t.status,
       t.priority,
       to_char(t.due_date, 'YYYY-MM-DD') AS due,
       to_char(t.created_at::date, 'YYYY-MM-DD') AS created,
       COALESCE(
         array_agg(DISTINCT a.user_id ORDER BY a.user_id)
           FILTER (WHERE a.user_id IS NOT NULL),
         ARRAY[]::text[]
       ) AS assignees
     FROM tasks t
     LEFT JOIN task_assignees a ON a.task_id = t.id
     WHERE t.id = $1
       AND ($2 = 'ADMIN' OR EXISTS (
         SELECT 1 FROM task_assignees own
          WHERE own.task_id = t.id AND own.user_id = $3
       ))
     GROUP BY t.id`,
    [taskId, user.role, user.id],
  );
  return result.rows[0] || null;
}

export async function updateTaskStatus(user, taskId, status) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT t.status
         FROM tasks t
        WHERE t.id = $1
          AND ($2 = 'ADMIN' OR EXISTS (
            SELECT 1 FROM task_assignees a
             WHERE a.task_id = t.id AND a.user_id = $3
          ))
        FOR UPDATE OF t`,
      [taskId, user.role, user.id],
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }

    const previousStatus = current.rows[0].status;
    await client.query("UPDATE tasks SET status = $2 WHERE id = $1", [
      taskId,
      status,
    ]);
    if (previousStatus !== status)
      await writeAuditLog(client, {
        actorId: user.id,
        action: "task.status_changed",
        entityType: "task",
        entityId: taskId,
        details: { from: previousStatus, to: status },
      });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listTaskPeople(user, taskId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.job_title AS job, u.photo_key AS photo
       FROM tasks t
       JOIN task_assignees a ON a.task_id = t.id
       JOIN users u ON u.id = a.user_id
      WHERE t.id = $1
        AND u.status = 'Active'
        AND ($2 = 'ADMIN' OR EXISTS (
          SELECT 1 FROM task_assignees own
           WHERE own.task_id = t.id AND own.user_id = $3
        ))
      ORDER BY u.name`,
    [taskId, user.role, user.id],
  );
  return result.rows;
}

export async function listProjectPeople(user, projectId) {
  const result = await pool.query(
    `SELECT u.id, u.name, u.job_title AS job, u.photo_key AS photo
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       JOIN users u ON u.id = pm.user_id
      WHERE p.id = $1
        AND u.status = 'Active'
        AND ($2 = 'ADMIN' OR EXISTS (
          SELECT 1 FROM project_members own
           WHERE own.project_id = p.id AND own.user_id = $3
        ))
      ORDER BY u.name`,
    [projectId, user.role, user.id],
  );
  return result.rows;
}
