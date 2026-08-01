/** True when PostgREST reports a missing column/table (prod DB behind migrations). */
export function isMissingSchemaError(message?: string): boolean {
  if (!message) return false;
  return (
    message.includes("does not exist")
    || message.includes("schema cache")
  );
}

export const SCORES_RUBRIC_MODERN =
  "technical_depth, communication, reproducibility, problem_solving, feedback_td, feedback_comm, feedback_repro, feedback_ps";

export const SCORES_RUBRIC_LEGACY =
  "technical_depth, communication, reproducibility, originality, feedback_td, feedback_comm, feedback_repro, feedback_orig";

export const SCORES_CORE = "id, total_score, final_score, passed";

/** Prefer modern rubric tries before legacy when DB may have either column set. */
export function isLegacyRubricMissing(message?: string): boolean {
  if (!message) return false;
  return message.includes("originality") || message.includes("feedback_orig");
}

export function isModernRubricMissing(message?: string): boolean {
  if (!message) return false;
  return message.includes("problem_solving") || message.includes("feedback_ps");
}
