export async function writeAuditLog(
  client,
  { actorId, action, entityType, entityId, details = {} },
) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, entityType, entityId, JSON.stringify(details)],
  );
}
