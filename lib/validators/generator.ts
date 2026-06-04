import { z } from "zod";

export const generateSchema = z.object({
  target_role:      z.enum(["ML Engineer", "AI Engineer", "MLOps", "NLP Engineer", "CV Engineer"]),
  current_stack:    z.string().min(2).max(300),
  experience_level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  problem_area:     z.enum(["Healthcare", "Finance", "E-commerce", "Education", "Other"]).optional(),
  time_available:   z.enum(["2 weeks", "1 month", "2 months"]).optional(),
});

export const saveIdeaSchema = z.object({
  project_name:              z.string().min(3).max(200),
  description:               z.string().min(10),
  tech_stack:                z.string().min(2).max(500),
  difficulty:                z.number().int().min(1).max(5),
  why_reviewable:            z.string().min(10),
  key_architectural_decision: z.string().min(10),
  what_could_go_wrong:       z.string().min(10),
  source:                    z.enum(["public", "dashboard"]),
});

export type GenerateInput = z.infer<typeof generateSchema>;

// Shape Claude must return
export interface GeneratedIdea {
  project_name:              string;
  one_line_description:      string;
  recommended_stack:         string;
  difficulty:                string;
  why_reviewable:            string;
  key_architectural_decision: string;
  what_could_go_wrong:       string;
}

export interface GenerateResponse {
  ideas: GeneratedIdea[];
}
