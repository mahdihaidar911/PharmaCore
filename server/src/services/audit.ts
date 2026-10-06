import { db } from "../db/index.js";

export function logAudit(params: {
  userId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  details?: Record<string, unknown>;
}) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.userId ?? null,
    params.action,
    params.entityType,
    params.entityId ?? null,
    params.details ? JSON.stringify(params.details) : null,
  );
}
