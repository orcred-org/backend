import { z } from "zod";

export const updateAccountSettingsSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
});

export const accountEmailChangeSchema = z.object({
  new_email: z.string().trim().email().max(320),
});
