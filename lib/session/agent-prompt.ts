type ApplicationContext = {
  project_name: string | null;
  tech_stack: string | null;
  github_url: string | null;
  loom_url: string | null;
  build_decision_1: string | null;
  build_decision_2: string | null;
  build_decision_3: string | null;
  what_broke: string | null;
  ai_tools_used: string | null;
};

const FOCUS_LABELS: Record<string, string> = {
  opening: "opening questions to understand scope and ownership",
  technical_depth: "architecture, trade-offs, and technical depth",
  communication: "clarity of explanation and teaching ability",
  reproducibility: "documentation, setup, and whether others could run it",
  problem_solving: "debugging, failures, and genuine problem solving vs tutorial following",
  follow_up: "deeper follow-ups based on likely weak spots",
  red_flags: "signals of shallow understanding or AI-generated work without comprehension",
};

export const SESSION_AGENT_SYSTEM = `You are a silent copilot for an Orcred live technical reviewer — a senior ML engineer conducting a 40-minute Socratic review with a student.

Your job is to suggest probing questions the reviewer can ask aloud. You never speak to the student directly. Questions must be open-ended, specific to the student's submission, and hard to answer with memorised or AI-generated fluff.

Return JSON only. No markdown. Shape:
{
  "questions": ["string", ...],
  "probe_areas": ["string", ...],
  "coaching_tip": "string"
}

Rules:
- Provide 4–6 questions.
- Reference concrete details from the submission when available.
- Prefer "why", "what broke", "what would you change", "walk me through" phrasing.
- Do not suggest yes/no questions.
- coaching_tip is one sentence for the reviewer only.`;

export function buildSessionAgentUserPrompt(
  app: ApplicationContext,
  focus: string | undefined,
  sessionNotes: string | undefined,
): string {
  const focusLine = focus
    ? `Focus this batch on: ${FOCUS_LABELS[focus] ?? focus}.`
    : "Balance across the rubric: technical depth, communication, reproducibility, problem solving.";

  const lines = [
    focusLine,
    "",
    "Student submission:",
    `- Project: ${app.project_name ?? "Unknown"}`,
    `- Stack: ${app.tech_stack ?? "Not provided"}`,
    `- GitHub: ${app.github_url ?? "Not provided"}`,
    `- Loom: ${app.loom_url ?? "Not provided"}`,
    `- Build decision 1: ${app.build_decision_1 ?? "—"}`,
    `- Build decision 2: ${app.build_decision_2 ?? "—"}`,
    `- Build decision 3: ${app.build_decision_3 ?? "—"}`,
    `- What broke: ${app.what_broke ?? "—"}`,
    `- AI tools used: ${app.ai_tools_used ?? "—"}`,
  ];

  if (sessionNotes?.trim()) {
    lines.push("", "Reviewer notes so far (private):", sessionNotes.trim().slice(0, 3000));
  }

  return lines.join("\n");
}

export const SESSION_AGENT_FEEDBACK_SYSTEM = `You are a silent copilot for an Orcred technical reviewer drafting written feedback after a live Socratic review.

Write feedback the reviewer can paste into the score form and edit. Be direct, specific, and tied to the submission and session notes. Mention strengths and concrete gaps. Do not invent facts not supported by the notes or submission.

Return JSON only. No markdown. Shape:
{
  "draft": "string — 2-4 short paragraphs, plain text",
  "highlights": ["string", ...]
}

Rules:
- draft is ready to paste; no greeting sign-off
- highlights are 3-5 bullet-style one-liners (strengths or gaps)
- If notes are thin, say what to probe in the written feedback without pretending you heard the call`;

export function buildSessionAgentFeedbackPrompt(
  app: ApplicationContext,
  sessionNotes: string,
): string {
  const lines = [
    "Draft written feedback for the reviewer score form.",
    "",
    "Student submission:",
    `- Project: ${app.project_name ?? "Unknown"}`,
    `- Stack: ${app.tech_stack ?? "Not provided"}`,
    `- GitHub: ${app.github_url ?? "Not provided"}`,
    `- Build decisions: ${[app.build_decision_1, app.build_decision_2, app.build_decision_3].filter(Boolean).join(" | ") || "—"}`,
    `- What broke: ${app.what_broke ?? "—"}`,
    `- AI tools used: ${app.ai_tools_used ?? "—"}`,
  ];

  if (sessionNotes.trim()) {
    lines.push("", "Reviewer session notes:", sessionNotes.trim().slice(0, 4000));
  } else {
    lines.push("", "Reviewer session notes: (none yet — base draft on submission only)");
  }

  return lines.join("\n");
}
