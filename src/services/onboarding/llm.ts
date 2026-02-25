import { z, type ZodSchema } from "zod";

type Provider = "openai" | "anthropic";

function provider(): Provider {
  return (process.env.LLM_PROVIDER ?? "openai") === "anthropic" ? "anthropic" : "openai";
}

function apiKey(p: Provider): string | null {
  if (p === "openai") return process.env.OPENAI_API_KEY ?? null;
  return process.env.ANTHROPIC_API_KEY ?? null;
}

function model(p: Provider): string {
  if (p === "openai") return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return process.env.ANTHROPIC_MODEL ?? "claude-3-haiku-20240307";
}

function cleanJsonFence(s: string): string {
  return s.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
}

export async function llmJson<T>(args: {
  schema: ZodSchema<T>;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<{ ok: true; value: T; raw: string } | { ok: false; error: string; raw: string }> {
  const p = provider();
  const key = apiKey(p);
  if (!key) return { ok: false, error: "LLM not configured", raw: "" };

  const temp = args.temperature ?? 0.2;
  const sys = `${args.system}\n\nReturn ONLY valid JSON that matches this schema:\n${args.schema.toString()}`;
  const user = `${args.user}\n\nReturn ONLY JSON.`;

  try {
    let raw = "";
    if (p === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model(p),
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
          temperature: temp,
          max_tokens: args.maxTokens,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) return { ok: false, error: `OpenAI API error: ${res.status}`, raw: "" };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model(p),
          max_tokens: args.maxTokens,
          temperature: temp,
          system: sys,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) return { ok: false, error: `Anthropic API error: ${res.status}`, raw: "" };
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      raw = data.content?.[0]?.text?.trim() ?? "";
    }

    const cleaned = cleanJsonFence(raw);
    const parsed = JSON.parse(cleaned) as unknown;
    const out = args.schema.safeParse(parsed);
    if (!out.success) {
      return { ok: false, error: out.error.message, raw };
    }
    return { ok: true, value: out.data, raw };
  } catch (e) {
    return { ok: false, error: (e as Error).message, raw: "" };
  }
}

export async function llmJsonArray<T>(args: {
  schema: ZodSchema<T>;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}): Promise<{ ok: true; value: T[]; raw: string } | { ok: false; error: string; raw: string }> {
  const arrSchema = z.array(args.schema);
  const r = await llmJson({ ...args, schema: arrSchema });
  return r as any;
}

