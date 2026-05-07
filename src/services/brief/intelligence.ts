export type PriorityEmailInput = {
  id: string;
  unread: boolean;
  importanceScore: number | null;
  needsAction: boolean | null;
  actionType: string | null;
  confidence: number | null;
  categoryName: string | null;
  senderDomain?: string | null;
  fromEmail?: string | null;
  briefDismissedAt?: Date | string | null;
  briefNotImportantAt?: Date | string | null;
  explainJson?: Record<string, unknown> | null;
};

export type PriorityExplanation = {
  summary: string | null;
  signals: string[];
};

export function isDigestCategoryName(name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return ["newsletters", "promotions", "low-priority"].includes(n);
}

export function isLowSignalPriorityCategoryName(
  name: string | null,
  excludePriorityCategories: string[]
): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return excludePriorityCategories.some((c) => n.includes(c.toLowerCase()));
}

function isHandled(e: PriorityEmailInput): boolean {
  return !!e.briefDismissedAt;
}

function isNotImportant(e: PriorityEmailInput): boolean {
  return !!e.briefNotImportantAt;
}

export function computePriorityScore(
  e: PriorityEmailInput,
  opts: { excludePriorityCategories: string[]; boostCategories: string[] }
): number {
  // Handled/acknowledged means: remove from active attention.
  if (isHandled(e)) return 0;
  // Not important means: this item should not resurface unchanged.
  if (isNotImportant(e)) return 0;
  const cat = e.categoryName ?? "";
  const imp = e.importanceScore ?? 0;
  const needs = e.needsAction ?? false;
  const unread = e.unread;

  const boosted =
    !isLowSignalPriorityCategoryName(cat, opts.excludePriorityCategories) &&
    opts.boostCategories.some((b) => cat.toLowerCase().includes(b.toLowerCase()));
  const boost = boosted ? 0.15 : 0;

  const base = needs || imp >= 0.8 ? 1 : imp >= 0.6 ? 0.8 : unread ? 0.4 : 0;
  return base + boost;
}

export function buildPriorityExplanation(
  e: PriorityEmailInput,
  opts: { excludePriorityCategories: string[]; boostCategories: string[] }
): PriorityExplanation {
  const signals: string[] = [];
  const cat = e.categoryName ?? null;
  const imp = e.importanceScore ?? null;
  const needs = e.needsAction ?? null;
  const conf = e.confidence ?? null;
  const actionType = e.actionType ?? null;
  const explain = e.explainJson ?? null;

  if (needs === true) signals.push("needs_action");
  if (actionType) signals.push(`action:${actionType}`);

  if (typeof imp === "number") {
    if (imp >= 0.8) signals.push("importance:high");
    else if (imp >= 0.6) signals.push("importance:mid");
    else signals.push("importance:low");
  } else {
    signals.push("importance:unknown");
  }

  if (cat) {
    signals.push(`category:${cat}`);
    if (isLowSignalPriorityCategoryName(cat, opts.excludePriorityCategories)) {
      signals.push("category:low_signal");
    }
  }

  const boosted =
    !!cat &&
    !isLowSignalPriorityCategoryName(cat, opts.excludePriorityCategories) &&
    opts.boostCategories.some((b) => cat.toLowerCase().includes(b.toLowerCase()));
  if (boosted) signals.push("boosted_category");

  const manualOverride = !!explain?.manualCategoryOverrideFromBrief;
  if (manualOverride) signals.push("manual_category_override");

  if (typeof conf === "number") {
    if (conf >= 0.85) signals.push("confidence:high");
    else if (conf >= 0.65) signals.push("confidence:mid");
    else signals.push("confidence:low");
  } else {
    signals.push("confidence:unknown");
  }

  let summary: string | null = null;
  if (needs === true) {
    if (actionType === "reply") summary = "Likely needs a reply.";
    else if (actionType === "schedule") summary = "Likely needs scheduling.";
    else if (actionType === "read") summary = "Worth reading soon.";
    else summary = "Likely needs action.";
  } else if (typeof imp === "number" && imp >= 0.8) {
    summary = "High-signal thread.";
  } else if (typeof imp === "number" && imp >= 0.6) {
    summary = "Probably worth a look.";
  }

  if (manualOverride) {
    summary = summary ? `${summary} (You re-categorized this.)` : "You re-categorized this.";
  }

  if (!summary && boosted) {
    summary = "Boosted because it matches a high-value category.";
  }

  if (!summary && typeof conf === "number" && conf < 0.6) {
    summary = "Surfaced with low confidence — correct it if it’s wrong.";
  }

  return { summary, signals };
}

export function selectTopPriorities(
  emails: PriorityEmailInput[],
  opts: {
    excludePriorityCategories: string[];
    boostCategories: string[];
    maxPriorities: number;
    allowLowSignalIfImportanceAtLeast?: number;
    minScore?: number;
  }
): Array<{ id: string; score: number; explanation: PriorityExplanation }> {
  const allowLowSignalIfImportanceAtLeast = opts.allowLowSignalIfImportanceAtLeast ?? 0.9;
  const minScore = opts.minScore ?? 0.6;

  const notImportantSenders = new Set(
    emails
      .filter((e) => !!e.briefNotImportantAt)
      .map((e) => (e.fromEmail ?? "").toLowerCase().trim())
      .filter(Boolean)
  );
  const notImportantDomains = new Set(
    emails
      .filter((e) => !!e.briefNotImportantAt)
      .map((e) => (e.senderDomain ?? "").toLowerCase().trim())
      .filter(Boolean)
  );

  const candidates = emails.filter((e) => {
    const imp = e.importanceScore ?? 0;
    const needs = e.needsAction ?? false;
    if (
      isLowSignalPriorityCategoryName(e.categoryName, opts.excludePriorityCategories) &&
      !needs &&
      imp < allowLowSignalIfImportanceAtLeast
    ) {
      return false;
    }
    if (!e.unread && !needs && imp < 0.8) return false;
    return computePriorityScore(e, opts) >= minScore;
  });

  const scored = candidates.map((e) => ({
    id: e.id,
    score: (() => {
      let s = computePriorityScore(e, opts);
      // Lightweight learning: if you've marked a sender/domain as \"not important\",
      // de-prioritize similar items (while still allowing true action-needed items through).
      if (s > 0) {
        const needs = e.needsAction ?? false;
        if (!needs) {
          const fromKey = (e.fromEmail ?? "").toLowerCase().trim();
          const domainKey = (e.senderDomain ?? "").toLowerCase().trim();
          if (fromKey && notImportantSenders.has(fromKey)) s -= 0.55;
          else if (domainKey && notImportantDomains.has(domainKey)) s -= 0.35;
        }
      }
      return Math.max(0, s);
    })(),
    explanation: buildPriorityExplanation(e, opts),
    importanceScore: e.importanceScore ?? 0,
  }));

  scored.sort((a, b) => {
    const d = b.score - a.score;
    if (d !== 0) return d;
    const imp = b.importanceScore - a.importanceScore;
    if (imp !== 0) return imp;
    return a.id.localeCompare(b.id);
  });

  return scored.slice(0, Math.max(0, opts.maxPriorities));
}

