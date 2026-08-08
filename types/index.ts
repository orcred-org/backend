export type UserRole = "student" | "reviewer" | "admin";

export type ApplicationStatus =
  | "submitted"
  | "payment_pending"
  | "payment_confirmed"
  | "reviewer_assigned"
  | "scheduled"
  | "completed";

export type AssignmentStatus =
  | "assigned"
  | "scheduled"
  | "completed"
  | "no_show_student"
  | "no_show_reviewer";

export interface User {
  id: string;
  email: string;
  account_type: UserRole;
  full_name: string | null;
  college: string | null;
  graduation_year: number | null;
  linkedin_url: string | null;
  created_at: string;
  consent_given: boolean;
  consent_at: string | null;
}

export interface Application {
  id: string;
  user_id: string;
  project_idea_id: string | null;
  project_name: string;
  tech_stack: string;
  github_url: string;
  loom_url: string;
  build_decision_1: string;
  build_decision_2: string;
  build_decision_3: string;
  what_broke: string;
  ai_tools_used: string;
  availability: AvailabilitySlot[];
  status: ApplicationStatus;
  utr_number: string | null;
  payment_screenshot_url: string | null;
  payment_amount: number;
  payment_at: string | null;
  submitted_at: string;
  recording_consent: boolean;
  recording_url: string | null;
  recording_delete_at: string | null;
  dispute_flag: boolean;
}

export interface AvailabilitySlot {
  date: string;       // ISO date string e.g. "2026-06-10"
  time: string;       // "14:00"
  timezone: string;   // "Asia/Kolkata"
}

export interface Score {
  id: string;
  application_id: string;
  reviewer_id: string;
  technical_depth: number;
  communication: number;
  reproducibility: number;
  problem_solving: number;
  total_score: number;
  passed: boolean;
  feedback_td: string;
  feedback_comm: string;
  feedback_repro: string;
  feedback_ps: string;
  internal_notes: string | null;
  submitted_at: string;
  is_borderline: boolean;
  second_review_requested: boolean;
  second_reviewer_id: string | null;
  second_review_score: number | null;
  final_score: number;
}

export interface Credential {
  id: string;
  application_id: string;
  user_id: string;
  credential_id: string;
  credential_url: string;
  issued_at: string;
  linkedin_added: boolean;
  linkedin_added_at: string | null;
  hash: string;
  public_opt_in: boolean;
}

export interface ProjectIdea {
  id: string;
  user_id: string;
  project_name: string;
  description: string;
  tech_stack: string;
  difficulty: number;
  why_reviewable: string;
  key_architectural_decision: string;
  what_could_go_wrong: string;
  is_active: boolean;
  generated_at: string;
  source: "public" | "dashboard";
}

export interface ApiResponse<T = null> {
  success: boolean;
  data?: T;
  error?: string;
}
