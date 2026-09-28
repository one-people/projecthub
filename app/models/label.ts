import { z } from "zod";

/** 项目级标签色板（与主题靛蓝家族协调） */
export const LABEL_COLORS = [
  "#4F46E5", "#0EA5E9", "#0F766E", "#059669",
  "#D97706", "#DC2626", "#DB2777", "#7C3AED",
] as const;

export const labelSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  createdAt: z.string(),
});
export type Label = z.infer<typeof labelSchema>;
export type LabelInput = z.input<typeof labelSchema>;
