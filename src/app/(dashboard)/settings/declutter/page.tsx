import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addCategory, addCategoryFromGmail, upsertCategoryDeclutterRule, updateDeclutterAutoArchive } from "@/lib/setup-actions";
import { ensureDeclutterRulesForCategories } from "@/lib/setup-defaults";
import { asDbErrorInfo } from "@/lib/db-errors";
import { listUserLabels, type GmailLabelInfo } from "@/services/gmail/labels";
import { AutoArchiveToggle } from "./AutoArchiveToggle";
import { CategoryRuleRow } from "./CategoryRuleRow";
import { DeclutterSuggestionsList } from "./DeclutterSuggestionsList";
import { RuleRow } from "../../rules/RuleRow";
import Link from "next/link";
import { buildRuleSuggestions } from "@/services/declutter/suggestions";

function rulesHref(base: {
  importParam: string | null;
  q: string;
  ruleType: string;
  rulesSort: string;
  rulesPageSize: string;
  rulesPage: number;
}): string {
  const sp = new URLSearchParams();
  if (base.importParam) sp.set("import", base.importParam);
  if (base.q) sp.set("q", base.q);
  if (base.ruleType) sp.set("ruleType", base.ruleType);
  if (base.rulesSort) sp.set("rulesSort", base.rulesSort);
  if (base.rulesPageSize) sp.set("rulesPageSize", base.rulesPageSize);
  sp.set("rulesPage", String(base.rulesPage));
  return `/settings/declutter?${sp.toString()}#rules`;
}

export default async function DeclutterPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    import?: string;
    ruleError?: string;
    q?: string;
    ruleType?: string;
    rulesSort?: string;
    rulesPage?: string;
    rulesPageSize?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;
  const ruleError = typeof params.ruleError === "string" ? params.ruleError : null;

  const ruleQ = typeof params.q === "string" ? params.q.trim() : "";
  const ruleTypeRaw = typeof params.ruleType === "string" ? params.ruleType : "all";
  const ruleType: "all" | "person" | "org" =
    ruleTypeRaw === "person" || ruleTypeRaw === "org" ? ruleTypeRaw : "all";
  const rulesSortRaw = typeof params.rulesSort === "string" ? params.rulesSort : "recent";
  const rulesSort: "recent" | "alpha" | "category" =
    rulesSortRaw === "alpha" || rulesSortRaw === "category" ? rulesSortRaw : "recent";
  const rulesPage = Math.max(1, parseInt(params.rulesPage ?? "1", 10) || 1);
  const rulesPageSizeRaw = typeof params.rulesPageSize === "string" ? params.rulesPageSize : "10";
  const rulesPageSize =
    rulesPageSizeRaw === "all"
      ? "all"
      : Math.min(50, Math.max(10, parseInt(rulesPageSizeRaw, 10) || 10));
  const rulesTake = ruleType === "all" ? 10 : rulesPageSize === "all" ? 200 : rulesPageSize;
  const rulesSkip = ruleType === "all" ? 0 : (rulesPage - 1) * rulesTake;

  type GmailLabelsByAccountRow =
    | { accountId: string; accountEmail: string; labels: GmailLabelInfo[] }
    | { accountId: string; accountEmail: string; error: string };

  let dbError: string | null = null;
  let accounts: { id: string; email: string }[] = [];
  let declutterPref: any = null;
  let categories: any[] = [];
  let categoryRules: any[] = [];
  let personRules: any[] = [];
  let orgRules: any[] = [];
  let personRuleCount = 0;
  let orgRuleCount = 0;
  let suggestedEvents: any[] = [];
  let rejected: any[] = [];
  let gmailLabelsByAccount: GmailLabelsByAccountRow[] | null = null;

  try {
    accounts = await prisma.googleAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true, email: true },
    });
    const accountIds = accounts.map((a) => a.id);

    [
      declutterPref,
      categories,
      categoryRules,
      personRules,
      orgRules,
      personRuleCount,
      orgRuleCount,
      suggestedEvents,
      rejected,
      gmailLabelsByAccount,
    ] = await Promise.all([
      prisma.userDeclutterPref.findUnique({ where: { userId: session.user.id } }),
      prisma.category.findMany({
        where: { userId: session.user.id },
        include: { parent: { select: { name: true } } },
        orderBy: [{ parentId: "asc" }, { name: "asc" }],
      }),
      prisma.categoryDeclutterRule.findMany({
        where: { userId: session.user.id },
        include: { category: true },
      }),
      ruleType === "org"
        ? Promise.resolve([])
        : prisma.personRule.findMany({
            where: {
              userId: session.user.id,
              ...(ruleQ ? { email: { contains: ruleQ, mode: "insensitive" as const } } : {}),
            },
            include: { category: true },
            orderBy:
              rulesSort === "alpha"
                ? { email: "asc" }
                : rulesSort === "category"
                  ? { category: { name: "asc" } }
                  : { updatedAt: "desc" },
            take: rulesTake,
            skip: rulesSkip,
          }),
      ruleType === "person"
        ? Promise.resolve([])
        : prisma.orgRule.findMany({
            where: {
              userId: session.user.id,
              ...(ruleQ ? { domain: { contains: ruleQ, mode: "insensitive" as const } } : {}),
            },
            include: { category: true },
            orderBy:
              rulesSort === "alpha"
                ? { domain: "asc" }
                : rulesSort === "category"
                  ? { category: { name: "asc" } }
                  : { updatedAt: "desc" },
            take: rulesTake,
            skip: rulesSkip,
          }),
      ruleType === "org"
        ? Promise.resolve(0)
        : prisma.personRule.count({
            where: {
              userId: session.user.id,
              ...(ruleQ ? { email: { contains: ruleQ, mode: "insensitive" as const } } : {}),
            },
          }),
      ruleType === "person"
        ? Promise.resolve(0)
        : prisma.orgRule.count({
            where: {
              userId: session.user.id,
              ...(ruleQ ? { domain: { contains: ruleQ, mode: "insensitive" as const } } : {}),
            },
          }),
      prisma.emailEvent.findMany({
        where: {
          googleAccountId: { in: accountIds },
          classificationCategoryId: { not: null },
        },
        include: { category: true },
        orderBy: { date: "desc" },
        take: 50,
      }),
      prisma.rejectedSuggestion.findMany({
        where: { userId: session.user.id },
        select: { type: true, value: true },
      }),
      params.import === "gmail" && accounts.length > 0
        ? Promise.all(
            accounts.map(async (acc) => {
              try {
                const labels = await listUserLabels(acc.id, session.user.id);
                return { accountId: acc.id, accountEmail: acc.email, labels };
              } catch (e) {
                return {
                  accountId: acc.id,
                  accountEmail: acc.email,
                  error: (e as Error).message,
                };
              }
            })
          )
        : Promise.resolve(null),
    ]);

    // Ensure every category has a rule (in case added via setup step 4)
    await ensureDeclutterRulesForCategories(session.user.id);
  } catch (e) {
    dbError = asDbErrorInfo(e)?.message ?? (e as Error)?.message ?? "Database error";
  }

  if (dbError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Declutter policy</h1>
          <p className="text-muted-foreground mt-1">Per-category rules and auto-archive.</p>
        </div>
        <div className="rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-red-300 text-sm">
          {dbError}
        </div>
        <p className="text-muted-foreground text-sm">
          If this keeps happening in production, Neon may be waking up or the database URL may be
          misconfigured.
        </p>
      </div>
    );
  }

  const gmailLabelsByAccountResult = gmailLabelsByAccount;
  const gmailLabelsError =
    gmailLabelsByAccountResult?.some((a) => "error" in a)
      ? gmailLabelsByAccountResult.find((a) => "error" in a)?.error ?? null
      : null;

  const rulesByCategory = new Map(
    categoryRules.map((r) => [r.categoryId, r])
  );

  const knownEmails = new Set(personRules.map((r) => r.email.toLowerCase()));
  const knownDomains = new Set(orgRules.map((r) => r.domain.toLowerCase()));
  const rejectedKeys = new Set(rejected.map((r) => `${r.type}:${r.value}`));

  const ruleTotal = ruleType === "person" ? personRuleCount : ruleType === "org" ? orgRuleCount : 0;
  const rulesTotalPages =
    ruleType === "all" || rulesPageSize === "all"
      ? 1
      : Math.max(1, Math.ceil(ruleTotal / rulesTake));
  const rulesPageClamped = Math.min(rulesPage, rulesTotalPages);

  const suggestions = buildRuleSuggestions({
    events: suggestedEvents,
    knownEmails,
    knownDomains,
    rejectedKeys,
    limit: 50,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Declutter policy</h1>
        {params.saved === "auto" && (
          <div className="mt-2 rounded-lg bg-emerald-950/50 border border-emerald-800 px-3 py-2 text-emerald-300 text-sm">
            Auto-archive preference saved
          </div>
        )}
        {params.saved === "rule" && (
          <div className="mt-2 rounded-lg bg-emerald-950/50 border border-emerald-800 px-3 py-2 text-emerald-300 text-sm">
            Category rule saved
          </div>
        )}
        {ruleError && (
          <div className="mt-2 rounded-lg bg-red-950/50 border border-red-800 px-3 py-2 text-red-300 text-sm">
            {ruleError}
          </div>
        )}
        <p className="text-muted-foreground mt-1">
          Set how ChiefOS should handle low-priority email. Preview and one-off operations live under{" "}
          <Link href="/settings/declutter/operations" className="text-accent hover:underline">
            Operations
          </Link>
          . Undo safely in{" "}
          <Link href="/audit" className="text-accent hover:underline">
            Audit
          </Link>
          .
        </p>
        <p className="text-muted-foreground text-sm mt-2">
          <Link href="/settings/declutter/preview" className="text-accent hover:underline">
            Preview decisions →
          </Link>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/settings/declutter"
            aria-current="page"
            className="rounded-xl px-3 py-1.5 text-sm font-medium bg-surface2/70 text-foreground"
          >
            Policy
          </Link>
          <Link
            href="/settings/declutter/operations"
            className="rounded-xl px-3 py-1.5 text-sm font-medium bg-surface/50 text-muted-foreground hover:text-foreground hover:bg-surface2/60"
          >
            Operations
          </Link>
        </div>
      </div>

      <section id="suggested-actions" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-medium">Suggested actions</h2>
        <p className="text-muted-foreground text-sm">
          Lightweight rule suggestions based on what you’ve been receiving.
        </p>
        {suggestions.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="text-base font-medium text-foreground/90">Suggested rules</h3>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {suggestions.length} to review
              </span>
            </div>
            <DeclutterSuggestionsList suggestions={suggestions} categories={categories} />
          </>
        ) : (
          <div className="rounded-2xl border border-border/10 bg-surface/50 px-6 py-8 text-center shadow-soft">
            <p className="text-emerald-400/90 font-medium">All clear!</p>
            <p className="text-muted-foreground text-sm mt-1">No rules to review. Your queue is empty.</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Auto-archive</h2>
        <p className="text-muted-foreground text-sm">
          When enabled, emails matching archive rules are auto-archived (with audit). Protected
          categories never auto-archive. Off by default.
        </p>
        <div className="flex items-center gap-3">
          <AutoArchiveToggle
            enabled={!!declutterPref?.autoArchiveEnabled}
            disableForm={
              <form action={updateDeclutterAutoArchive}>
                <input type="hidden" name="enabled" value="false" />
                <button
                  type="submit"
                  className="rounded-lg bg-red-900/50 px-4 py-2 font-medium text-red-300 hover:bg-red-900/70"
                >
                  Disable auto-archive
                </button>
              </form>
            }
            enableForm={
              <form action={updateDeclutterAutoArchive}>
                <input type="hidden" name="enabled" value="true" />
                <button
                  type="submit"
                  className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground hover:opacity-90"
                >
                  I understand, enable
                </button>
              </form>
            }
          />
          <span className="text-muted-foreground text-sm">
            {declutterPref?.autoArchiveEnabled ? "On" : "Off"}
          </span>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          <Link href="/settings/declutter/operations" className="text-accent hover:underline">
            View upcoming operations →
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Per-category actions</h2>
        <p className="text-muted-foreground text-sm">
          <strong>Label + digest</strong>: Apply labels, show in Digest.{" "}
          <strong>Archive after 48h</strong>: Auto-archive 48h+ when enabled.{" "}
          <strong>Archive after N days</strong>: Auto-archive when rule is on.{" "}
          <strong>Move to Spam</strong>: Move to Gmail Spam.{" "}
          <strong>Never</strong>: Keep in inbox. Click each category&apos;s dropdown to choose. Undo via Audit.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <form action={addCategory} className="flex gap-2">
            <input type="hidden" name="returnTo" value={params.import === "gmail" ? "/settings/declutter?import=gmail" : "/settings/declutter"} />
            <input
              type="text"
              name="name"
              placeholder="New category name"
              required
              className="rounded-xl border border-border/10 bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-40"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              Create category
            </button>
          </form>
          <Link
            href={params.import === "gmail" ? "/settings/declutter" : "/settings/declutter?import=gmail"}
            className="rounded-xl border border-border/10 bg-surface/50 px-3 py-1.5 text-sm text-foreground hover:bg-surface2/60"
          >
            {params.import === "gmail" ? "← Back" : "Import from Gmail"}
          </Link>
          <Link
            href="/settings/categories"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Manage all categories →
          </Link>
        </div>
        {params.import === "gmail" && (
          <div className="rounded-2xl border border-border/10 bg-surface/60 p-4 mt-4 shadow-soft">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground/90">Gmail labels (all accounts)</h3>
              <Link
                href="/settings/declutter"
                className="text-muted-foreground hover:text-foreground text-sm"
                title="Close"
              >
                ✕ Close
              </Link>
            </div>
            {gmailLabelsError ? (
              <p className="text-red-400 text-sm">{gmailLabelsError}</p>
            ) : gmailLabelsByAccountResult && gmailLabelsByAccountResult.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {gmailLabelsByAccountResult.map((accResult) => {
                  if ("error" in accResult) {
                    return (
                      <div key={accResult.accountId} className="text-red-400 text-sm">
                        {accResult.accountEmail}: {accResult.error}
                      </div>
                    );
                  }
                  const { accountEmail, labels } = accResult;
                  if (labels.length === 0) return null;
                  return (
                    <div key={accResult.accountId}>
                      <div className="text-xs font-medium text-muted-foreground mb-2 truncate">
                        {accountEmail}
                      </div>
                      <ul className="space-y-2">
                        {labels.map((label) => {
                          const linked = categories.some((c) => c.gmailLabelId === label.id);
                          return (
                            <li
                              key={`${accResult.accountId}-${label.id}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-border/10 bg-surface/40 px-3 py-2"
                            >
                              <span className="text-foreground truncate">{label.name}</span>
                              {linked ? (
                                <span className="text-emerald-500 text-xs shrink-0">Linked</span>
                              ) : (
                                <form action={addCategoryFromGmail}>
                                  <input type="hidden" name="gmailLabelId" value={label.id} />
                                  <input type="hidden" name="name" value={label.name} />
                                  <button
                                    type="submit"
                                    className="text-sm text-accent hover:text-accent/80"
                                  >
                                    Add as category
                                  </button>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : gmailLabelsByAccountResult ? (
              <p className="text-muted-foreground text-sm">No user labels in Gmail. Create labels in Gmail first.</p>
            ) : accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Connect a Google account first.</p>
            ) : null}
          </div>
        )}
        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add categories in{" "}
            <Link href="/settings/categories" className="text-accent hover:underline">
              Categories
            </Link>{" "}
            to configure rules.
          </p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c) => {
              const rule = rulesByCategory.get(c.id);
              return (
                <CategoryRuleRow
                  key={c.id}
                  categoryId={c.id}
                  categoryName={c.name}
                  currentAction={rule?.action ?? "label_only"}
                  currentArchiveAfterDays={rule?.archiveAfterDays ?? null}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section id="rules" className="space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-medium text-foreground/90">Rules</h3>
            <div className="text-xs text-muted-foreground mt-1">
              {ruleType === "all" ? (
                <>
                  Sender rules: {personRuleCount.toLocaleString()} · Domain rules: {orgRuleCount.toLocaleString()}
                </>
              ) : ruleType === "person" ? (
                <>Sender rules: {personRuleCount.toLocaleString()}</>
              ) : (
                <>Domain rules: {orgRuleCount.toLocaleString()}</>
              )}
            </div>
          </div>

          <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="import" value={params.import ?? ""} />
            <label className="text-muted-foreground">
              Type{" "}
              <select
                name="ruleType"
                defaultValue={ruleType}
                className="ml-1 rounded-xl border border-border/10 bg-background px-2 py-1 text-foreground"
              >
                <option value="all">All</option>
                <option value="person">Sender</option>
                <option value="org">Domain</option>
              </select>
            </label>
            <label className="text-muted-foreground">
              Sort{" "}
              <select
                name="rulesSort"
                defaultValue={rulesSort}
                className="ml-1 rounded-xl border border-border/10 bg-background px-2 py-1 text-foreground"
              >
                <option value="recent">Most recent</option>
                <option value="alpha">Alphabetical</option>
                <option value="category">Category</option>
              </select>
            </label>
            <label className="text-muted-foreground">
              Show{" "}
              <select
                name="rulesPageSize"
                defaultValue={rulesPageSizeRaw}
                className="ml-1 rounded-xl border border-border/10 bg-background px-2 py-1 text-foreground"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="all">View all</option>
              </select>
            </label>
            <input
              name="q"
              defaultValue={ruleQ}
              placeholder="Search sender/domain…"
              className="w-44 rounded-xl border border-border/10 bg-background px-2 py-1 text-foreground placeholder:text-muted-foreground"
            />
            <input type="hidden" name="rulesPage" value="1" />
            <button
              type="submit"
              className="rounded-xl border border-border/10 bg-surface/50 px-3 py-1 text-foreground hover:bg-surface2/60"
            >
              Apply
            </button>
          </form>
        </div>

        {ruleType !== "all" && rulesPageSize !== "all" && rulesTotalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {rulesPageClamped} of {rulesTotalPages}
            </span>
            <div className="flex items-center gap-2">
              <Link
                href={rulesHref({
                  importParam: typeof params.import === "string" ? params.import : null,
                  q: ruleQ,
                  ruleType,
                  rulesSort,
                  rulesPageSize: rulesPageSizeRaw,
                  rulesPage: Math.max(1, rulesPageClamped - 1),
                })}
                className={`rounded-xl border border-border/10 bg-surface/50 px-2 py-1 hover:bg-surface2/60 ${
                  rulesPageClamped <= 1 ? "pointer-events-none opacity-40" : ""
                }`}
              >
                Prev
              </Link>
              <Link
                href={rulesHref({
                  importParam: typeof params.import === "string" ? params.import : null,
                  q: ruleQ,
                  ruleType,
                  rulesSort,
                  rulesPageSize: rulesPageSizeRaw,
                  rulesPage: Math.min(rulesTotalPages, rulesPageClamped + 1),
                })}
                className={`rounded-xl border border-border/10 bg-surface/50 px-2 py-1 hover:bg-surface2/60 ${
                  rulesPageClamped >= rulesTotalPages ? "pointer-events-none opacity-40" : ""
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        )}

        {ruleType !== "org" && (
          <>
            <h4 className="text-sm font-medium text-foreground/90">Sender rules</h4>
        {personRules.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sender rules yet.</p>
        ) : (
          <ul className="space-y-2">
            {personRules.map((r) => (
              <RuleRow
                key={r.id}
                ruleType="person"
                ruleId={r.id}
                label={r.email}
                categoryId={r.categoryId}
                categoryName={r.category.name}
                categories={categories}
              />
            ))}
          </ul>
        )}
          </>
        )}

        {ruleType !== "person" && (
          <>
            <h4 className="text-sm font-medium text-foreground/90 mt-4">Domain rules</h4>
        {orgRules.length === 0 ? (
          <p className="text-muted-foreground text-sm">No domain rules yet.</p>
        ) : (
          <ul className="space-y-2">
            {orgRules.map((r) => (
              <RuleRow
                key={r.id}
                ruleType="org"
                ruleId={r.id}
                label={r.domain}
                categoryId={r.categoryId}
                categoryName={r.category.name}
                categories={categories}
              />
            ))}
          </ul>
        )}
          </>
        )}
      </section>

      <p className="text-muted-foreground text-sm">
        <Link href="/brief" className="hover:text-foreground">
          ← Back to Brief
        </Link>
      </p>
    </div>
  );
}
