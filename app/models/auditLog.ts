import { z } from "zod";

export const auditActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "restore",
  "purge",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditLogSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: auditActionSchema,
  entityType: z.enum(["task", "project", "comment", "user"]),
  entityId: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;
