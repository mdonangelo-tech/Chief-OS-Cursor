import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { onboardingV1Enabled } from "@/lib/env";
import { OnboardingGoalsClient } from "./ui";

const SUGGESTED = [
  { key: "noise_reduction", label: "Reduce noise & newsletters" },
  { key: "vip_people", label: "Never miss important people" },
  { key: "deep_work", label: "Protect deep work time" },
  { key: "portfolio_updates", label: "Be on top of portfolio/company updates" },
  { key: "family_logistics", label: "Family logistics clarity" },
  { key: "health", label: "Health / appointments tracking" },
] as const;

export default async function OnboardingGoalsPage() {
  if (!onboardingV1Enabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const saved = await prisma.userGoal.findMany({
    where: { userId },
    select: { key: true, label: true, enabled: true, notes: true },
    orderBy: { key: "asc" },
  });

  const freeText = saved.find((g) => g.key === "__free_text")?.notes ?? "";
  const savedByKey = new Map(saved.map((g) => [g.key, g]));

  const items = SUGGESTED.map((s) => {
    const g = savedByKey.get(s.key);
    return {
      key: s.key,
      label: g?.label ?? s.label,
      enabled: g?.enabled ?? true,
      notes: g?.notes ?? null,
    };
  });

  return <OnboardingGoalsClient initialGoals={items} initialFreeText={freeText} />;
}

