import { z } from "zod";

export const assignReviewerSchema = z.object({
  application_id: z.string().uuid(),
  reviewer_id:    z.string().uuid(),
  session_date:   z.string().datetime(),
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
