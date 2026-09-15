import { db } from "~/repositories/db";
import { uuid } from "~/lib/id";
import type { AuditAction, AuditLog } from "~/models/auditLog";

export interface AuditFilter {
  actorId?: string;
  action?: AuditAction;
  entityType?: AuditLog["entityType"];
  limit?: number;
}

export const auditService = {
  async log(
    actorId: string,
    action: AuditAction,
    entityType: AuditLog["entityType"],
    entityId: string,
    summary: string,
  ): Promise<void> {
    await db.auditLogs.add({
      id: uuid(),
      actorId,
      action,
      entityType,
      entityId,
      summary,
      createdAt: new Date().toISOString(),
    });
  },

  async list(filter: AuditFilter = {}): Promise<AuditLog[]> {
    const rows = await db.auditLogs
      .orderBy("createdAt")
      .reverse()
      .limit(filter.limit ?? 50)
      .toArray();
    return rows.filter(
      (r) =>
        (!filter.actorId || r.actorId === filter.actorId) &&
        (!filter.action || r.action === filter.action) &&
        (!filter.entityType || r.entityType === filter.entityType),
    );
  },
};
