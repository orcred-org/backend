import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type SessionAgentLlmProvider = "openai" | "anthropic";

export function sessionAgentLlmConfigured(): {
  configured: boolean;
  provider: SessionAgentLlmProvider | null;
} {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return { configured: true, provider: "openai" };
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return { configured: true, provider: "anthropic" };
  }
  return { configured: false, provider: null };
}

export function parseAgentJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(body) as T;
}

function llmErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    message?: string;
    error?: { message?: string; error?: { message?: string } };
  };
  return e.error?.error?.message ?? e.error?.message ?? e.message ?? null;
}

export async function completeSessionAgentJson(options: {
  system: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<string> {
  const { configured, provider } = sessionAgentLlmConfigured();
  if (!configured || !provider) {
    throw new Error("Session assistant is not configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY).");
  }

  try {
    if (provider === "openai") {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
      const completion = await client.chat.completions.create({
        model,
        max_tokens: options.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.userPrompt },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty response from OpenAI");
      return text;
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
      max_tokens: options.maxTokens,
      system: options.system,
      messages: [{ role: "user", content: options.userPrompt }],
    });
    const text = message.content[0]?.type === "text" ? message.content[0].text : "";
    if (!text.trim()) throw new Error("Empty response from Anthropic");
    return text;
  } catch (err) {
    const detail = llmErrorMessage(err);
    const billing =
      detail?.toLowerCase().includes("credit balance")
      || detail?.toLowerCase().includes("billing")
      || detail?.toLowerCase().includes("quota")
      || detail?.toLowerCase().includes("insufficient");
    if (billing) {
      throw new Error(`LLM billing/quota error: ${detail}`);
    }
    if (detail) throw new Error(detail);
    throw err;
  }
}
