import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export type UserInput = z.input<typeof userSchema>;
