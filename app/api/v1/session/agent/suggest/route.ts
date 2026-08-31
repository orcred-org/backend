import { NextRequest } from "next/server";
import { corsJson } from "@/lib/cors";
import { getSessionWithRole, allowsRole } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { sessionAgentByUser } from "@/lib/ratelimit";
import { participantRoleError, resolveParticipantRole } from "@/lib/session/participant-role";
import { fetchSessionAssignment } from "@/lib/session/fetch-assignment";
import {
  buildSessionAgentFeedbackPrompt,
  buildSessionAgentUserPrompt,
  SESSION_AGENT_FEEDBACK_SYSTEM,
  SESSION_AGENT_SYSTEM,
} from "@/lib/session/agent-prompt";
import { completeSessionAgentJson, parseAgentJson, sessionAgentLlmConfigured } from "@/lib/session/agent-llm";
import { sessionAgentSuggestSchema } from "@/lib/validators/session";

export async function POST(req: NextRequest) {
  const llm = sessionAgentLlmConfigured();
  if (!llm.configured) {
    return corsJson(
      req,
      { success: false, error: "Session assistant is not configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY)." },
      503,
    );
  }

  const session = await getSessionWithRole(req);
  if (!session) {
    return corsJson(req, { success: false, error: "Unauthorized" }, 401);
  }

  if (!allowsRole(session, "reviewer")) {
    return corsJson(req, { success: false, error: "Reviewer access required" }, 403);
  }

  const { success: rateOk } = await sessionAgentByUser.limit(session.id);
  if (!rateOk) {
    return corsJson(req, { success: false, error: "Too many assistant requests — try again shortly." }, 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson(req, { success: false, error: "Invalid request" }, 400);
  }

  const parsed = sessionAgentSuggestSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(req, { success: false, error: parsed.error.flatten() }, 422);
  }

  const requestedAs = req.nextUrl.searchParams.get("as");
  const roleHint = requestedAs === "reviewer" || requestedAs === "student" ? requestedAs : null;

  const supabase = createServiceClient();
  const { assignment_id, focus, session_notes, mode } = parsed.data;

  const { data: assignment, error: fetchError } = await fetchSessionAssignment(supabase, assignment_id);

  if (fetchError || !assignment) {
    return corsJson(
      req,
      { success: false, error: fetchError === "Session not found" ? "Assignment not found" : (fetchError ?? "Assignment not found") },
      fetchError === "Session not found" ? 404 : 500,
    );
  }

  const app = Array.isArray(assignment.applications)
    ? assignment.applications[0]
    : assignment.applications;

  const role = resolveParticipantRole(
    session,
    { reviewer_id: assignment.reviewer_id },
    app?.user_id,
    roleHint ?? "reviewer",
  );

  const canUseAgent = role === "reviewer" || session.role === "admin";

  if (!canUseAgent) {
    return corsJson(
      req,
      { success: false, error: participantRoleError(roleHint ?? "reviewer") },
      403,
    );
  }

  const sessionDone =
    !!assignment.session_completed_at
    || assignment.workflow_stage === "session_done"
    || ["score_submitted", "score_approved", "completed"].includes(assignment.workflow_stage ?? "");

  const notesForPrompt =
    session_notes?.trim()
    || (typeof assignment.reviewer_session_notes === "string" ? assignment.reviewer_session_notes : "");

  const appContext = {
    project_name: app?.project_name ?? null,
    tech_stack: app?.tech_stack ?? null,
    github_url: app?.github_url ?? null,
    loom_url: app?.loom_url ?? null,
    build_decision_1: app?.build_decision_1 ?? null,
    build_decision_2: app?.build_decision_2 ?? null,
    build_decision_3: app?.build_decision_3 ?? null,
    what_broke: app?.what_broke ?? null,
    ai_tools_used: app?.ai_tools_used ?? null,
  };

  const isFeedbackDraft = mode === "feedback_draft";
  const system = isFeedbackDraft ? SESSION_AGENT_FEEDBACK_SYSTEM : SESSION_AGENT_SYSTEM;
  const userPrompt = isFeedbackDraft
    ? buildSessionAgentFeedbackPrompt(appContext, notesForPrompt)
    : buildSessionAgentUserPrompt(appContext, focus, notesForPrompt || undefined);

  try {
    const raw = await completeSessionAgentJson({
      system,
      userPrompt,
      maxTokens: isFeedbackDraft ? 1200 : 900,
    });

    if (isFeedbackDraft) {
      let payload: { draft: string; highlights?: string[] };
      try {
        payload = parseAgentJson(raw);
        if (typeof payload.draft !== "string" || !payload.draft.trim()) {
          throw new Error("Invalid shape");
        }
      } catch {
        return corsJson(req, { success: false, error: "Assistant returned an invalid response — try again." }, 500);
      }

      return corsJson(req, {
        success: true,
        data: {
          draft: payload.draft.trim(),
          highlights: payload.highlights ?? [],
          session_done: sessionDone,
        },
      });
    }

    let payload: { questions: string[]; probe_areas?: string[]; coaching_tip?: string };

    try {
      payload = parseAgentJson(raw);
      if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
        throw new Error("Invalid shape");
      }
    } catch {
      return corsJson(req, { success: false, error: "Assistant returned an invalid response — try again." }, 500);
    }

    return corsJson(req, {
      success: true,
      data: {
        questions: payload.questions.slice(0, 8),
        probe_areas: payload.probe_areas ?? [],
        coaching_tip: payload.coaching_tip ?? "",
        session_done: sessionDone,
      },
    });
  } catch (err) {
    console.error("[session/agent/suggest]", err);
    const detail = err instanceof Error ? err.message : "Assistant request failed — try again.";
    const billing = detail.toLowerCase().includes("billing/quota") || detail.toLowerCase().includes("quota");
    return corsJson(
      req,
      {
        success: false,
        error: billing
          ? "Session assistant is unavailable — LLM API quota exhausted. Check your OpenAI or Anthropic billing, then try again."
          : detail,
      },
      billing ? 503 : 500,
    );
  }
}
