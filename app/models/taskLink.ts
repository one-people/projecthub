import { z } from "zod";

/** 任务关联类型：blocks = from 阻塞 to；relates = 相互关联 */
export const taskLinkSchema = z.object({
  id: z.string(),
  fromTaskId: z.string(),
  toTaskId: z.string(),
  type: z.enum(["blocks", "relates"]),
  createdAt: z.string(),
});
export type TaskLink = z.infer<typeof taskLinkSchema>;
