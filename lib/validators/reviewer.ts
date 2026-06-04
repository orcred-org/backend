import { z } from "zod";

const scoreField = z.number().int().min(0).max(100);
const feedbackField = z.string().min(50);

export const submitScoreSchema = z.object({
  application_id:   z.string().uuid(),
  technical_depth:  scoreField,
  feedback_td:      feedbackField,
  communication:    scoreField,
  feedback_comm:    feedbackField,
  reproducibility:  scoreField,
  feedback_repro:   feedbackField,
  originality:      scoreField,
  feedback_orig:    feedbackField,
  internal_notes:   z.string().optional(),
  confirm:          z.literal(true),
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
