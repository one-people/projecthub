import { z } from "zod";

export const statusColumnSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  isDone: z.boolean().default(false), // 落入该列视为已完成
  order: z.number().int(),
});
export type StatusColumn = z.infer<typeof statusColumnSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().default(""),
  statusColumns: z.array(statusColumnSchema),
  memberRoles: z.record(z.string()), // userId -> roleId
  deletedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(0),
});
export type Project = z.infer<typeof projectSchema>;

export type ProjectInput = z.input<typeof projectSchema>;
