import {
  isLowSignalCategoryName,
  rankingSignalKeys,
  strongestLearnedPenalty,
  type RankingPenalties,
} from "@/services/attention/ranking-signals";

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
  labels?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  briefDismissedAt?: Date | string | null;
  briefNotImportantAt?: Date | string | null;
  /** ThreadAttention.closedAt (handled / dismissed at thread level). */
  threadClosedAt?: Date | string | null;
  /** ThreadAttention: not_important or neverSimilar. */
  threadNotImportant?: boolean;
  /** Active snooze hides item from priorities until this time. */
  threadSnoozeUntil?: Date | string | null;
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
  return excludePriorityCategories.some((c) => n.includes(c.toLowerCase())) || isLowSignalCategoryName(n);
}

function ts(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const t = typeof v === "string" ? new Date(v).getTime() : v.getTime();
  return Number.isFinite(t) ? t : null;
}

function isSnoozedActive(e: PriorityEmailInput, nowMs: number): boolean {
  const t = ts(e.threadSnoozeUntil ?? null);
  return t != null && t > nowMs;
}

function isHandled(e: PriorityEmailInput): boolean {
  return !!e.briefDismissedAt || !!e.threadClosedAt;
}

function isNotImportant(e: PriorityEmailInput): boolean {
  return !!e.briefNotImportantAt || !!e.threadNotImportant;
}

export function computePriorityScore(
  e: PriorityEmailInput,
  opts: {
    excludePriorityCategories: string[];
    boostCategories: string[];
    /** Optional ranking penalties from UserRankingProfile (0–1 each). */
    rankingPenalties?: Partial<RankingPenalties>;
    nowMs?: number;
  }
): number {
  const nowMs = opts.nowMs ?? Date.now();
  if (isSnoozedActive(e, nowMs)) return 0;
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

  let base = needs || imp >= 0.8 ? 1 : imp >= 0.6 ? 0.8 : unread ? 0.4 : 0;
  const learned = strongestLearnedPenalty(e, opts.rankingPenalties);
  if (learned.value > 0 && base > 0) {
    const keys = rankingSignalKeys(e);
    if (!needs || keys.isLowSignalNotification) {
      base -= learned.value;
      if (keys.isLowSignalNotification && learned.value >= 0.34) return 0;
    }
  }
  return Math.max(0, base + boost);
}

export function buildPriorityExplanation(
  e: PriorityEmailInput,
  opts: {
    excludePriorityCategories: string[];
    boostCategories: string[];
    rankingPenalties?: Partial<RankingPenalties>;
    nowMs?: number;
  }
): PriorityExplanation {
  const signals: string[] = [];
  const cat = e.categoryName ?? null;
  const imp = e.importanceScore ?? null;
  const needs = e.needsAction ?? null;
  const conf = e.confidence ?? null;
  const actionType = e.actionType ?? null;
  const explain = e.explainJson ?? null;

  const nowMs = opts.nowMs ?? Date.now();
  if (isSnoozedActive(e, nowMs)) signals.push("snoozed");
  if (e.threadClosedAt) signals.push("thread_handled");
  if (e.threadNotImportant) signals.push("thread_not_important");
  const keys = rankingSignalKeys(e);
  const learned = strongestLearnedPenalty(e, opts.rankingPenalties);
  if (learned.source && learned.value > 0 && (!needs || keys.isLowSignalNotification)) {
    if (learned.source === "sender") signals.push("learned:sender_downrank");
    else if (learned.source === "domain") signals.push("learned:domain_downrank");
    else if (learned.source === "canonical_domain") signals.push("learned:org_downrank");
    else if (learned.source === "category") signals.push("learned:category_downrank");
    else if (learned.source === "pattern") signals.push("learned:pattern_downrank");
  }
  if (keys.isLowSignalNotification) {
    signals.push("notification:low_signal");
  }
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
  if (isSnoozedActive(e, nowMs)) {
    summary = "Snoozed — ChiefOS will bring this back after the quiet period.";
  } else if (needs === true) {
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

  const learnedSignals = signals.some((s) => s.startsWith("learned:"));
  if (summary && learnedSignals) {
    summary = `${summary} Rank adjusted from your past “not important” feedback.`;
  } else if (!summary && learnedSignals) {
    summary = "Rank adjusted from your past “not important” feedback.";
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
    rankingPenalties?: Partial<RankingPenalties>;
    nowMs?: number;
  }
): Array<{ id: string; score: number; explanation: PriorityExplanation }> {
  const allowLowSignalIfImportanceAtLeast = opts.allowLowSignalIfImportanceAtLeast ?? 0.9;
  const minScore = opts.minScore ?? 0.6;

  const notImportantSenders = new Set(
    emails
      .filter((e) => !!e.briefNotImportantAt || !!e.threadNotImportant)
      .map((e) => (e.fromEmail ?? "").toLowerCase().trim())
      .filter(Boolean)
  );
  const notImportantDomains = new Set(
    emails
      .filter((e) => !!e.briefNotImportantAt || !!e.threadNotImportant)
      .map((e) => (e.senderDomain ?? "").toLowerCase().trim())
      .filter(Boolean)
  );

  const candidates = emails.filter((e) => {
    const imp = e.importanceScore ?? 0;
    const needs = e.needsAction ?? false;
    const keys = rankingSignalKeys(e);
    if (keys.isLowSignalNotification && !needs && imp < allowLowSignalIfImportanceAtLeast) {
      return false;
    }
    if (
      !keys.isProtected &&
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
      // Lightweight in-list learning: if you've marked a sender/domain as not important,
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

