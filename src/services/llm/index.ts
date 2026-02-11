/**
 * LLM abstraction: swappable provider via env.
 * Feature-flagged: only runs when LLM_CLASSIFICATION_ENABLED=true.
 */

export interface ClassificationOutput {
  category_name: string;
  subcategory_name: string | null;
  importance_score: number;
  needs_action: boolean;
  action_type: "reply" | "schedule" | "read" | "ignore";
  reason: string;
  confidence: number;
  suggested_rule?: {
    type: "domain" | "person";
    value: string;
    category_name: string;
  };
}

const EXPECTED_KEYS = [
  "category_name",
  "subcategory_name",
  "importance_score",
  "needs_action",
  "action_type",
  "reason",
  "confidence",
] as const;

function parseStrictJson(text: string): ClassificationOutput | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of EXPECTED_KEYS) {
      if (!(key in parsed)) return null;
    }
    const out = parsed as unknown as ClassificationOutput;
    if (
      typeof out.importance_score !== "number" ||
      typeof out.needs_action !== "boolean" ||
      typeof out.confidence !== "number"
    ) {
      return null;
    }
    if (
      !["reply", "schedule", "read", "ignore"].includes(out.action_type)
    ) {
      return null;
    }
    return out;
  } catch {
    return null;
  }
}

/** LLM is enabled when flag is true OR when API key is set (default: try API key) */
export function isLlmClassificationEnabled(): boolean {
  if (process.env.LLM_CLASSIFICATION_ENABLED === "false") return false;
  if (process.env.LLM_CLASSIFICATION_ENABLED === "true") return true;
  const provider = process.env.LLM_PROVIDER ?? "openai";
  const key =
    provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return !!key;
}

/** For UI: LLM status (enabled, provider, model) */
export function getLlmStatus(): {
  enabled: boolean;
  provider: string;
  model: string;
  configured: boolean;
} {
  const enabled = isLlmClassificationEnabled();
  const provider = process.env.LLM_PROVIDER ?? "openai";
  const model =
    provider === "openai"
      ? (process.env.OPENAI_MODEL ?? "gpt-4o-mini")
      : (process.env.ANTHROPIC_MODEL ?? "claude-3-haiku");
  const key =
    provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return {
    enabled,
    provider,
    model,
    configured: !!key,
  };
}

/**
 * Classify email via LLM. Returns null if disabled or parse fails.
 * Pass categoryNames to bias output toward user's categories.
 */
export async function classifyEmailWithLlm(
  _from: string,
  _subject: string | null,
  _snippet: string | null,
  _senderDomain: string | null,
  categoryNames?: string[]
): Promise<ClassificationOutput | null> {
  if (!isLlmClassificationEnabled()) return null;

  const provider = process.env.LLM_PROVIDER ?? "openai";
  const apiKey =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return null;

  const catHint =
    categoryNames?.length
      ? ` Use one of these category names if applicable: ${categoryNames.join(", ")}. Otherwise use closest match.`
      : "";

  const prompt = `Classify this email. Return ONLY valid JSON, no markdown.
{"category_name":"string","subcategory_name":null,"importance_score":0-1,"needs_action":true/false,"action_type":"reply|schedule|read|ignore","reason":"brief","confidence":0-1}
${catHint}

from=${_from} subject=${_subject ?? ""} snip=${(_snippet ?? "").slice(0, 150)}`;

  let rawResponse: string;

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    rawResponse = data.choices?.[0]?.message?.content?.trim() ?? "";
  } else if (provider === "anthropic") {
    const res = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-3-haiku-20240307",
          max_tokens: 200,
          messages: [{ role: "user", content: prompt }],
        }),
      }
    );
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    rawResponse = data.content?.[0]?.text?.trim() ?? "";
  } else {
    return null;
  }

  const cleaned = rawResponse.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return parseStrictJson(cleaned);
}

/** Batch classify up to 6 emails in one API call. More cost-effective than N individual calls. */
export async function classifyEmailsBatchWithLlm(
  emails: { from: string; subject: string | null; snippet: string | null }[],
  categoryNames?: string[]
): Promise<(ClassificationOutput | null)[]> {
  if (!isLlmClassificationEnabled() || emails.length === 0) return emails.map(() => null);

  const provider = process.env.LLM_PROVIDER ?? "openai";
  const apiKey =
    provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return emails.map(() => null);

  const catHint = categoryNames?.length ? ` Use categories: ${categoryNames.join(", ")}.` : "";
  const lines = emails
    .map(
      (e, i) =>
        `[${i}]: from=${e.from} subject=${e.subject ?? ""} snip=${(e.snippet ?? "").slice(0, 80)}`
    )
    .join("\n");

  const prompt = `Classify each email. Return a JSON array, one object per email in order.
Each: {"category_name":"","subcategory_name":null,"importance_score":0-1,"needs_action":bool,"action_type":"reply|schedule|read|ignore","reason":"brief","confidence":0-1}
${catHint}

${lines}`;

  try {
    let rawResponse: string;
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 600,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      rawResponse = data.choices?.[0]?.message?.content?.trim() ?? "";
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-3-haiku-20240307",
          max_tokens: 700,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      rawResponse = data.content?.[0]?.text?.trim() ?? "";
    }

    const cleaned = rawResponse.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const arr = JSON.parse(cleaned) as unknown[];
    const results: (ClassificationOutput | null)[] = [];
    for (let i = 0; i < emails.length; i++) {
      const item = arr[i];
      const parsed =
        item && typeof item === "object"
          ? parseStrictJson(JSON.stringify(item))
          : null;
      results.push(parsed);
    }
    return results;
  } catch {
    return emails.map(() => null);
  }
}

/** Calendar event analysis: focus, prep, watchouts */
export interface CalendarAnalysisOutput {
  focus_type: "meeting" | "deadline" | "block" | "other";
  needs_prep: boolean;
  prep_time_minutes: number | null;
  watchouts: string[];
  reason: string;
  confidence: number;
}

const CALENDAR_KEYS = [
  "focus_type",
  "needs_prep",
  "prep_time_minutes",
  "watchouts",
  "reason",
  "confidence",
] as const;

function parseCalendarJson(text: string): CalendarAnalysisOutput | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of CALENDAR_KEYS) {
      if (!(key in parsed)) return null;
    }
    const out = parsed as unknown as CalendarAnalysisOutput;
    if (
      !["meeting", "deadline", "block", "other"].includes(out.focus_type) ||
      typeof out.needs_prep !== "boolean" ||
      typeof out.confidence !== "number"
    ) {
      return null;
    }
    if (!Array.isArray(out.watchouts)) out.watchouts = [];
    return out;
  } catch {
    return null;
  }
}

export async function analyzeCalendarEventWithLlm(
  title: string | null,
  organizer: string | null,
  location: string | null,
  startAt: Date,
  durationMinutes: number | null,
  attendeeCount: number
): Promise<CalendarAnalysisOutput | null> {
  if (!isLlmClassificationEnabled()) return null;

  const provider = process.env.LLM_PROVIDER ?? "openai";
  const apiKey =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `Analyze this calendar event. Return ONLY valid JSON:
{
  "focus_type": "meeting|deadline|block|other",
  "needs_prep": true/false,
  "prep_time_minutes": number or null,
  "watchouts": ["short string"],
  "reason": "brief",
  "confidence": 0-1
}

Event: title="${title ?? ""}", organizer=${organizer ?? ""}, location=${location ?? ""}, start=${startAt.toISOString()}, duration=${durationMinutes ?? "?"}min, attendees=${attendeeCount}`;

  try {
    let rawResponse: string;
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 180,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      rawResponse = data.choices?.[0]?.message?.content?.trim() ?? "";
    } else if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-3-haiku",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      rawResponse = data.content?.[0]?.text?.trim() ?? "";
    } else {
      return null;
    }

    const cleaned = rawResponse.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return parseCalendarJson(cleaned);
  } catch {
    return null;
  }
}
