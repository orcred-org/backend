import { z } from "zod";

const ratingSchema = z.object({
  value:    z.number().min(0).max(5),
  excluded: z.boolean(),
});

const ratingsSchema = z.object({
  technical_depth:  ratingSchema,
  communication:    ratingSchema,
  reproducibility:  ratingSchema,
  problem_solving:  ratingSchema,
}).refine(
  (r) => Object.values(r).some((x) => !x.excluded),
  { message: "At least one criterion must be rated" },
);

export const submitScoreSchema = z.object({
  application_id:  z.string().uuid(),
  ratings:         ratingsSchema,
  feedback_notes:  z.string().min(10),
  confirm:         z.literal(true),
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;

export const updateReviewerProfileSchema = z.object({
  full_name: z.string().min(2).max(120),
  current_company: z.string().min(1).max(200),
  current_role: z.string().min(1).max(200),
  years_experience: z.number().int().min(5).max(50),
  linkedin_url: z.string().url().max(500),
  expertise: z.string().max(300).optional(),
  timezone: z.string().max(80).optional(),
});

export const proposeSessionSchema = z.object({
  assignment_id: z.string().uuid(),
  proposed_session_at: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

export const requestRescheduleSchema = z.object({
  assignment_id: z.string().uuid(),
  reason: z.string().min(10).max(1000),
  preferred_session_at: z.string().datetime().optional(),
});

export const createCustomTaskSchema = z.object({
  assignment_id: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(80).optional(),
  status: z.enum(["new", "todo", "in_progress", "done", "cancelled", "under_review"]).optional(),
});

export const updateTaskStatusSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(["todo", "in_progress", "done", "cancelled", "under_review"]),
});
