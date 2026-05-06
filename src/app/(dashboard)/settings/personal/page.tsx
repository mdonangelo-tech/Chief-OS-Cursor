import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { OnboardingGoalsClient } from "@/app/(dashboard)/onboarding/goals/ui";

export default async function SettingsPersonalPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const saved = await prisma.userGoal.findMany({
    where: { userId },
    select: { key: true, label: true, enabled: true, notes: true },
    orderBy: { key: "asc" },
  });

  const freeText = saved.find((g) => g.key === "__free_text")?.notes ?? "";
  const filtered = saved.filter((g) => g.key !== "__free_text");

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground">
          ← Back to Settings
        </Link>
      </div>
      <OnboardingGoalsClient
        initialGoals={filtered.map((g) => ({
          key: g.key,
          label: g.label,
          enabled: g.enabled,
          notes: g.notes ?? null,
        }))}
        initialFreeText={freeText}
        mode="settings"
      />
    </div>
  );
}

