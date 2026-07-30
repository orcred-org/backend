import { z } from "zod";

export const assignReviewerSchema = z.object({
  application_id: z.string().uuid(),
  reviewer_id:    z.string().uuid(),
  session_date:   z.string().datetime().optional(),
  confirm:        z.literal(true).optional(),
});

export const confirmPaymentSchema = z.object({
  application_id: z.string().uuid(),
});

export const updatePlacementSchema = z.object({
  placed:   z.boolean(),
  company:  z.string().max(200).optional(),
  role:     z.string().max(200).optional(),
  notes:    z.string().optional(),
});

export const updateReviewerSchema = z.object({
  action: z.enum(["suspend", "reinstate", "terminate"]),
  reason: z.string().min(5),
});

export const resetApplicationSchema = z.object({
  application_id: z.string().uuid().optional(),
  step: z.enum(["payment", "assignment", "score", "credential", "full"]),
  confirm: z.literal(true),
});

export const adminRescheduleSessionSchema = z.object({
  assignment_id: z.string().uuid(),
  new_session_at: z.string().datetime(),
  note: z.string().max(500).optional(),
});
