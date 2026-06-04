import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionWithRole } from "@/lib/auth/session";
import { generatorByUser, generatorByIp } from "@/lib/ratelimit";
import { generateSchema, GenerateResponse } from "@/lib/validators/generator";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior ML engineer helping a final year student in India choose an AI/ML project that will demonstrate genuine technical understanding in a live Socratic review with a senior engineer. The review will probe whether the student can defend every architectural decision they made. Generate projects that require real decision making — not tutorial assembly, not projects completable by prompting an AI for 20 minutes. Favour projects with genuine architectural choices, real failure modes, and non-obvious design decisions. Return JSON only. No markdown. No explanation outside the JSON structure.`;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Check if authenticated (dashboard) or public
  const session = await getSessionWithRole().catch(() => null);
  const isPublic = !session;

  // Rate limit by IP always
  const { success: ipOk } = await generatorByIp.limit(ip);
  if (!ipOk) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  // Rate limit by user if authenticated
  if (session) {
    const { success: userOk } = await generatorByUser.limit(session.id);
    if (!userOk) {
      return NextResponse.json(
        { success: false, error: "Daily generation limit reached. Try again tomorrow." },
        { status: 429 }
      );
    }
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 }); }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 422 });
  }

  const { target_role, current_stack, experience_level, problem_area, time_available } = parsed.data;

  // Sanitise inputs before including in prompt
  const sanitise = (s: string) => s.replace(/[<>]/g, "").slice(0, 300);

  const userPrompt = [
    `Target role: ${target_role}`,
    `Current stack: ${sanitise(current_stack)}`,
    `Experience level: ${experience_level}`,
    problem_area   ? `Problem area: ${problem_area}`  : null,
    time_available ? `Time available: ${time_available}` : null,
    `Generate 3 project ideas. Return a JSON object with an "ideas" array. Each idea must have: project_name, one_line_description, recommended_stack, difficulty (1-5 as string), why_reviewable, key_architectural_decision, what_could_go_wrong.`,
  ].filter(Boolean).join("\n");

  const message = await client.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  let parsed_response: GenerateResponse;
  try {
    parsed_response = JSON.parse(raw);
    if (!Array.isArray(parsed_response.ideas) || parsed_response.ideas.length === 0) {
      throw new Error("Invalid shape");
    }
  } catch {
    return NextResponse.json({ success: false, error: "Generation failed — please try again" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      ideas:     parsed_response.ideas,
      is_public: isPublic,
    },
  });
}
