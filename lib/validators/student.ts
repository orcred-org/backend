import { z } from "zod";

export const updateProfileSchema = z.object({
  full_name:       z.string().min(2).max(100).optional(),
  college:         z.string().min(2).max(200).optional(),
  graduation_year: z.number().int().min(2000).max(2030).optional(),
  linkedin_url:    z.string().url().regex(/linkedin\.com\/in\//).optional().or(z.literal("")),
});

export const availabilitySlotSchema = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time:        z.string().regex(/^\d{2}:\d{2}$/),
  timezone:    z.string().min(1),
  description: z.string().optional(),
});

export const submitApplicationSchema = z.object({
  project_name:     z.string().min(3).max(200),
  tech_stack:       z.string().min(2).max(500),
  github_url:       z.string().url().regex(/github\.com\//),
  loom_url:         z.string().url().regex(/loom\.com\//),
  build_decision_1: z.string().min(50),
  build_decision_2: z.string().min(50),
  build_decision_3: z.string().min(50),
  what_broke:       z.string().min(50),
  ai_tools_used:    z.string().min(10),
  availability:     z.array(availabilitySlotSchema).min(3).max(6),
  project_idea_id:  z.string().uuid().optional(),
  recording_consent: z.literal(true),
});

export const paymentSubmitSchema = z.object({
  application_id: z.string().uuid(),
  utr_number:     z.string().min(6).max(50),
});

export const requestRescheduleSchema = z.object({
  application_id: z.string().uuid(),
  reason: z.string().min(10).max(1000),
  preferred_session_at: z.string().datetime().optional(),
});
