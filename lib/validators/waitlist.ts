import { z } from "zod";

const domainTag = z.string().trim().min(1).max(80);

const referralSources = [
  "LinkedIn",
  "Twitter / X",
  "Friend or colleague",
  "University / campus",
  "Google search",
  "Reddit",
  "YouTube / podcast",
  "Other",
] as const;

export const waitlistSubmitSchema = z.object({
  full_name:       z.string().min(2).max(100),
  email:           z.string().email(),
  domains:         z.array(domainTag).min(1).max(3),
  degree:          z.string().min(1).max(80),
  referral_source: z.enum(referralSources),
  motivation:      z.string().min(20).max(2000),
});
export const waitlistUpdateSchema = z.object({
  status:      z.enum(["pending", "invited", "converted", "rejected"]).optional(),
  admin_notes: z.string().max(2000).optional(),
});

export const waitlistSendEmailSchema = z.object({
  entry_ids:    z.array(z.string().uuid()).min(1).max(500).optional(),
  status:       z.enum(["pending", "invited", "converted", "rejected"]).optional(),
  template:     z.enum(["update", "launch"]),
  subject:      z.string().min(1).max(200).optional(),
  message:      z.string().min(1).max(5000).optional(),
  mark_invited: z.boolean().optional(),
  send_to_all:  z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!data.entry_ids?.length && !data.status && !data.send_to_all) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide entry_ids, a status filter, or send_to_all",
      path: ["entry_ids"],
    });
  }
  if (data.template === "update" && !data.message?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Message is required for update emails",
      path: ["message"],
    });
  }
});
