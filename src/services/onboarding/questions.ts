import type { OnboardingQuestion } from "@/lib/llm/schemas";

type UncertainCluster = {
  key: "solo_default_kind" | "delegate_fyi" | "holds" | "generic_titles" | "classes";
  size: number;
  uncertaintyScore: number; // 0-1 (higher = more uncertain)
};

function qid(runId: string, key: string): string {
  return `${runId}:${key}`;
}

export function generateActiveLearningQuestions(args: {
  runId: string;
  uncertainClusters: UncertainCluster[];
  maxQuestions?: number;
}): OnboardingQuestion[] {
  const max = args.maxQuestions ?? 5;
  const ranked = [...args.uncertainClusters]
    .sort((a, b) => b.size * b.uncertaintyScore - a.size * a.uncertaintyScore)
    .slice(0, max);

  const out: OnboardingQuestion[] = [];

  for (const c of ranked) {
    if (c.size <= 0) continue;

    if (c.key === "solo_default_kind") {
      out.push({
        id: qid(args.runId, "solo_default_kind"),
        kind: "single_select",
        title: "Solo events",
        prompt: "When it’s just you on the invite, how should we treat it by default?",
        options: [
          { id: "TASK", label: "Task / to-do block (doesn’t mean a meeting)" },
          { id: "FOCUS", label: "Focus time (protect it)" },
          { id: "MEETING", label: "Treat as a real meeting" },
          { id: "ASK", label: "Ask when uncertain" },
        ],
        applyToAllDefault: true,
        clusterKey: "solo_default_kind",
        rationale: `We saw ${c.size} solo events with mixed signals.`,
      });
    } else if (c.key === "delegate_fyi") {
      out.push({
        id: qid(args.runId, "delegate_fyi"),
        kind: "free_text",
        title: "Family FYI vs blocking",
        prompt:
          "If kids/family invites include your spouse/nanny/assistant, what emails should we treat as delegates so those events become FYI (don’t block your calendar)? Provide comma-separated emails.",
        options: [],
        applyToAllDefault: true,
        clusterKey: "delegate_fyi",
        rationale: `We saw ${c.size} family/kids events where it’s unclear if they should block your time.`,
      });
    } else if (c.key === "holds") {
      out.push({
        id: qid(args.runId, "holds"),
        kind: "single_select",
        title: "Holds",
        prompt: "When you create a “Hold / Placeholder”, how should it behave by default?",
        options: [
          { id: "SOFT_HOLD", label: "Soft hold (FYI unless confirmed)" },
          { id: "HARD_BUSY", label: "Hard busy (protect the time)" },
        ],
        applyToAllDefault: true,
        clusterKey: "holds",
        rationale: `We saw ${c.size} holds/placeholders with low confidence.`,
      });
    } else if (c.key === "classes") {
      out.push({
        id: qid(args.runId, "classes"),
        kind: "single_select",
        title: "Classes & appointments",
        prompt: "How should appointments/classes be treated by default?",
        options: [
          { id: "BLOCK", label: "Blocking (counts as busy)" },
          { id: "FYI", label: "FYI (doesn’t block busy time)" },
        ],
        applyToAllDefault: true,
        clusterKey: "classes",
        rationale: `We saw ${c.size} appointment/class events with mixed signals.`,
      });
    } else if (c.key === "generic_titles") {
      out.push({
        id: qid(args.runId, "generic_titles"),
        kind: "single_select",
        title: "Generic titles",
        prompt:
          "When the title is generic (“Catch up”, “Touch base”, “Quick chat”), should we default to meeting or ask more often?",
        options: [
          { id: "MEETING", label: "Default to meeting" },
          { id: "ASK", label: "Ask when uncertain" },
        ],
        applyToAllDefault: true,
        clusterKey: "generic_titles",
        rationale: `We saw ${c.size} generic-title events where intent isn’t obvious.`,
      });
    }
  }

  return out.slice(0, max);
}

