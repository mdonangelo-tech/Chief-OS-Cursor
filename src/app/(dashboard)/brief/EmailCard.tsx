import { decodeHtmlEntities } from "@/lib/html-entities";

function text(s: string | null | undefined): string {
  return s ? decodeHtmlEntities(s) : "";
}

interface EmailCardProps {
  subject: string | null;
  from: string;
  snippet?: string | null;
  categoryName: string | null;
  confidence?: number | null;
  explainJson: {
    source?: string;
    categoryName?: string;
    reason?: string;
    confidence?: number;
  } | null;
  compact?: boolean;
}

/**
 * Scan-only card: priorities, digest. No rule editing (moved to Rules page).
 */
export function EmailCard({
  subject,
  from,
  snippet,
  categoryName,
  confidence,
  explainJson,
  compact = false,
}: EmailCardProps) {
  const conf = confidence ?? explainJson?.confidence;
  const why =
    explainJson?.reason ??
    explainJson?.categoryName ??
    (explainJson?.source ? `From ${explainJson.source}` : null);

  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="font-medium text-zinc-200">{text(subject) || "(No subject)"}</div>
      <div className="text-zinc-500 text-sm mt-1">
        {text(from)} {categoryName && `· ${text(categoryName)}`}
        {conf != null && (
          <span className="ml-2 text-zinc-600" title="Classification confidence">
            {Math.round(conf * 100)}%
          </span>
        )}
      </div>
      {snippet && !compact && (
        <p className="text-zinc-400 text-sm mt-2 line-clamp-2">{text(snippet)}</p>
      )}
      {why && (
        <p className="text-zinc-600 text-xs mt-1 italic">Why: {why}</p>
      )}
    </li>
  );
}
