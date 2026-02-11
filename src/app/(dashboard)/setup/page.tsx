import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addDefaultGoals,
  addDefaultCategories,
  addGoal,
  updateGoal,
  deleteGoal,
  addCategory,
  deleteCategory,
  upsertCategoryDeclutterRule,
} from "@/lib/setup-actions";
import { DEFAULT_CATEGORIES, DEFAULT_GOALS, seedUserSetup } from "@/lib/setup-defaults";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const step = params.step ?? "1";

  const [googleAccounts, goals, categories, declutterPref, categoryRules] =
    await Promise.all([
      prisma.googleAccount.count({ where: { userId: session.user.id } }),
      prisma.goal.findMany({ where: { userId: session.user.id } }),
      prisma.category.findMany({ where: { userId: session.user.id } }),
      prisma.userDeclutterPref.findUnique({ where: { userId: session.user.id } }),
      prisma.categoryDeclutterRule.findMany({
        where: { userId: session.user.id },
        include: { category: true },
      }),
    ]);

  const hasGoogle = googleAccounts > 0;
  const hasGoals = goals.length > 0;
  const hasCategories = categories.length > 0;
  const hasDeclutter = !!declutterPref;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Setup Chief of Staff</h1>
        <p className="text-zinc-400 mt-1">
          A few steps to personalize your daily brief
        </p>
      </div>

      <div className="flex gap-2 border-b border-zinc-800 pb-4">
        {[
          { n: "1", label: "Google", done: hasGoogle },
          { n: "2", label: "Goals", done: hasGoals },
          { n: "3", label: "Declutter", done: hasDeclutter },
          { n: "4", label: "Categories", done: hasCategories },
        ].map((s) => (
          <span
            key={s.n}
            className={`text-sm ${
              step === s.n
                ? "text-amber-500 font-medium"
                : s.done
                  ? "text-zinc-500"
                  : "text-zinc-600"
            }`}
          >
            {s.n}. {s.label}{s.done ? " ✓" : ""}
          </span>
        ))}
      </div>

      {step === "1" && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Connect Google account</h2>
          {hasGoogle ? (
            <p className="text-zinc-400">
              You have {googleAccounts} Google account(s) connected.{" "}
              <Link href="/settings/accounts" className="text-amber-500 hover:underline">
                Add another
              </Link>{" "}
              or continue.
            </p>
          ) : (
            <p className="text-zinc-400">
              Connect Gmail and Calendar to power your brief.
            </p>
          )}
          <Link
            href={hasGoogle ? "/setup?step=2" : "/api/connect-google?returnTo=/setup%3Fstep%3D2"}
            className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
          >
            {hasGoogle ? "Continue" : "Connect Google"}
          </Link>
        </section>
      )}

      {step === "2" && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Goals</h2>
          <p className="text-zinc-400 text-sm">
            Add your focus areas. Use defaults or customize.
          </p>
          <ul className="space-y-2">
            {goals.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
              >
                <form action={updateGoal} className="flex-1 flex gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <input
                    type="text"
                    name="title"
                    defaultValue={g.title}
                    className="flex-1 bg-transparent text-zinc-200 outline-none"
                  />
                  <button
                    type="submit"
                    className="text-xs text-amber-500 hover:text-amber-400"
                  >
                    Save
                  </button>
                </form>
                <form action={deleteGoal}>
                  <input type="hidden" name="id" value={g.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addGoal} className="flex gap-2">
            <input
              type="text"
              name="title"
              placeholder="Add a goal..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 placeholder-zinc-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-600"
            >
              Add
            </button>
          </form>
          <div className="flex gap-2">
            {goals.length === 0 && (
              <form action={addDefaultGoals}>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
                >
                  Use defaults
                </button>
              </form>
            )}
            <form
              action={async () => {
                "use server";
                await seedUserSetup(session.user!.id!);
                redirect("/setup?step=3");
              }}
            >
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
              >
                Continue
              </button>
            </form>
          </div>
        </section>
      )}

      {step === "3" && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Declutter preferences</h2>
          <p className="text-zinc-400 text-sm">
            Per-category rules: <strong>Label + digest</strong>, <strong>Archive after 48h</strong>,{" "}
            <strong>Move to Spam</strong>, or <strong>Never</strong>. Click each dropdown to choose. Auto-archive off by default—enable in{" "}
            <Link href="/settings/declutter" className="text-amber-500 hover:underline">
              Settings → Declutter
            </Link>
            .
          </p>
          {categories.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Complete step 2 (Continue) to add goals and categories—per-category rules will appear once you have categories.
            </p>
          ) : (
            <ul className="space-y-2">
              {categories.map((c) => {
                const rule = categoryRules.find((r) => r.categoryId === c.id);
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                  >
                    <span className="text-zinc-200 min-w-[100px]">{c.name}</span>
                    <form action={upsertCategoryDeclutterRule} className="flex gap-2">
                      <input type="hidden" name="categoryId" value={c.id} />
                      <input type="hidden" name="returnTo" value="/setup?step=3" />
                      <select
                        name="action"
                        defaultValue={rule?.action ?? "label_only"}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200"
                      >
                      <option value="label_only">Label + digest</option>
                      <option value="archive_after_48h">Archive after 48h</option>
                      <option value="archive_after_days">Archive after N days</option>
                      <option value="move_to_spam">Move to Spam</option>
                      <option value="never">Never</option>
                      </select>
                      <button
                        type="submit"
                        className="text-xs text-amber-500 hover:text-amber-400"
                      >
                        Save
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
          <form
            action={async () => {
              "use server";
              await seedUserSetup(session.user!.id!);
              redirect("/setup?step=4");
            }}
          >
            <button
              type="submit"
              className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
            >
              {hasDeclutter ? "Continue" : "Save (archive off) & continue"}
            </button>
          </form>
        </section>
      )}

      {step === "4" && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Categories</h2>
          <p className="text-zinc-400 text-sm">
            Email categories for classification. Newsletters and Promotions go to Digest by default.
          </p>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
              >
                <span className="text-zinc-200">{c.name}</span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addCategory} className="flex gap-2">
            <input type="hidden" name="returnTo" value="/setup?step=4" />
            <input
              type="text"
              name="name"
              placeholder="Add category..."
              required
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 placeholder-zinc-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-600"
            >
              Add
            </button>
          </form>
          <div className="flex gap-2">
            {categories.length === 0 && (
              <form action={addDefaultCategories}>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
                >
                  Use defaults
                </button>
              </form>
            )}
            <form
              action={async () => {
                "use server";
                await seedUserSetup(session.user!.id!);
                redirect("/brief");
              }}
            >
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
              >
                Finish
              </button>
            </form>
          </div>
        </section>
      )}

      <p className="text-zinc-500 text-sm">
        <Link href="/brief" className="hover:text-zinc-400">
          Skip setup →
        </Link>
      </p>
    </div>
  );
}
