import { z } from "zod";

export const milestoneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1).max(200),
  date: z.string(), // ISO 8601
  doneAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Milestone = z.infer<typeof milestoneSchema>;
