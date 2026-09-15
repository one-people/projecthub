import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  email: z.string().default(""),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean().default(true),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export type UserInput = z.input<typeof userSchema>;
