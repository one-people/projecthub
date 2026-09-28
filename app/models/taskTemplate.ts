import { z } from "zod";
import { prioritySchema } from "./task";

/** 任务模板：保存标题/优先级/子任务结构，从模板一键创建 */
export const taskTemplateSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().default(null), // null = 全局模板
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  priority: prioritySchema.default("none"),
  subtasks: z.array(z.object({ title: z.string() })).default([]),
  labels: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
