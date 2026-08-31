import { z } from "zod";

const earlyEndReasonSchema = z.string().min(10).max(1000);

export const studentSessionConfirmSchema = z.object({
  assignment_id: z.string().uuid(),
  feedback_audio: z.number().int().min(1).max(5).optional(),
  feedback_video: z.number().int().min(1).max(5).optional(),
  feedback_notes: z.string().max(1000).optional(),
  early_end_reason: earlyEndReasonSchema.optional(),
});

export const reviewerSessionDraftSchema = z.object({
  assignment_id: z.string().uuid(),
  draft: z.string().max(10000),
});

export const sessionNotesSchema = z.object({
  assignment_id: z.string().uuid(),
  notes: z.string().max(10000),
});

export const sessionJoinSchema = z.object({
  assignment_id: z.string().uuid(),
});

export const markSessionDoneSchema = z.object({
  action: z.literal("mark_session_done"),
  assignment_id: z.string().uuid(),
  early_end_reason: earlyEndReasonSchema.optional(),
});

export const sessionAgentSuggestSchema = z.object({
  assignment_id: z.string().uuid(),
  mode: z.enum(["questions", "feedback_draft"]).default("questions"),
  focus: z
    .enum([
      "opening",
      "technical_depth",
      "communication",
      "reproducibility",
      "problem_solving",
      "follow_up",
      "red_flags",
    ])
    .optional(),
  session_notes: z.string().max(4000).optional(),
});