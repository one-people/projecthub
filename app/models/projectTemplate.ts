import { z } from "zod";

/** 项目模板：内置或由现有项目另存（存列/标签/任务模板结构） */
export const projectTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().default(""),
  builtin: z.boolean().default(false),
  columns: z.array(z.object({ name: z.string(), isDone: z.boolean().default(false) })),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
  taskTemplates: z.array(z.object({ title: z.string(), priority: z.string().default("none") })),
  createdAt: z.string(),
});
export type ProjectTemplate = z.infer<typeof projectTemplateSchema>;
