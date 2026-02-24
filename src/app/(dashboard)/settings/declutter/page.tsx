import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addCategory, addCategoryFromGmail, upsertCategoryDeclutterRule, updateDeclutterAutoArchive } from "@/lib/setup-actions";
import { ensureDeclutterRulesForCategories } from "@/lib/setup-defaults";
import { GMAIL_CHIEFOS_ARCHIVED_URL, listUserLabels } from "@/services/gmail/labels";
import { AutoArchiveRunner } from "./AutoArchiveRunner";
import { ArchiveByDaysRunner } from "./ArchiveByDaysRunner";
import { AutoArchiveToggle } from "./AutoArchiveToggle";
import { CategoryRuleRow } from "./CategoryRuleRow";
import { SuggestionRow } from "../../rules/SuggestionRow";
import { RuleRow } from "../../rules/RuleRow";
import Link from "next/link";

function extractEmail(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  const trimmed = fromHeader.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return null;
}

function extractDomain(fromHeader: string): string | null {
  const email = extractEmail(fromHeader);
  if (!email) return null;
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

export default async function DeclutterPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; import?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const params = await searchParams;

  const accounts = await prisma.googleAccount.findMany({
    where: { userId: session.user.id },
    select: { id: true, email: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const [declutterPref, categories, categoryRules, personRules, orgRules, suggestedEvents, rejected, gmailLabelsByAccount] = await Promise.all([
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
    prisma.personRule.findMany({
      where: { userId: session.user.id },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.orgRule.findMany({
      where: { userId: session.user.id },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
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
              return { accountId: acc.id, accountEmail: acc.email, error: (e as Error).message };
            }
          })
        )
      : Promise.resolve(null),
  ]);
  const gmailLabelsByAccountResult = gmailLabelsByAccount;
  const gmailLabelsError =
    gmailLabelsByAccountResult?.some((a) => "error" in a)
      ? gmailLabelsByAccountResult.find((a) => "error" in a)?.error ?? null
      : null;

  // Ensure every category has a rule (in case added via setup step 4)
  await ensureDeclutterRulesForCategories(session.user.id);

  const rulesByCategory = new Map(
    categoryRules.map((r) => [r.categoryId, r])
  );

  const knownEmails = new Set(personRules.map((r) => r.email));
  const knownDomains = new Set(orgRules.map((r) => r.domain));
  const rejectedKeys = new Set(rejected.map((r) => `${r.type}:${r.value}`));

  type Suggestion = {
    id: string;
    from: string;
    email: string | null;
    domain: string | null;
    categoryName: string;
    confidence: number | null;
    band: "high" | "mid";
    snippet: string | null;
  };
  const suggestions: Suggestion[] = [];
  const seenIds = new Set<string>();
  for (const e of suggestedEvents) {
    const email = extractEmail(e.from_);
    const domain = extractDomain(e.from_) ?? e.senderDomain;
    const cat = e.category;
    if (!cat) continue;
    const needsSender = email && !knownEmails.has(email);
    const needsDomain = domain && !knownDomains.has(domain);
    if (!needsSender && !needsDomain) continue;
    if (rejectedKeys.has(`person:${email}`) || rejectedKeys.has(`domain:${domain}`)) continue;
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    const conf = e.confidence ?? (e.explainJson as { confidence?: number } | null)?.confidence ?? null;
    const band: "high" | "mid" = conf != null && conf >= 0.85 ? "high" : "mid";
    suggestions.push({
      id: e.id,
      from: e.from_,
      email,
      domain,
      categoryName: cat.name,
      confidence: conf,
      band,
      snippet: e.snippet,
    });
  }

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
        <p className="text-zinc-400 mt-1">
          Per-category rules and auto-archive. Archived emails get the{" "}
          <strong>ChiefOS/Archived</strong> label.{" "}
          <a
            href={GMAIL_CHIEFOS_ARCHIVED_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 hover:underline"
          >
            View in Gmail
          </a>{" "}
          · Undo in{" "}
          <Link href="/audit" className="text-amber-500 hover:underline">
            Audit
          </Link>
          .
        </p>
        <p className="text-zinc-500 text-sm mt-2">
          <Link href="/settings/declutter/preview" className="text-amber-500 hover:underline">
            Preview decisions →
          </Link>
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Auto-archive</h2>
        <p className="text-zinc-400 text-sm">
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
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500"
                >
                  I understand, enable
                </button>
              </form>
            }
          />
          <span className="text-zinc-500 text-sm">
            {declutterPref?.autoArchiveEnabled ? "On" : "Off"}
          </span>
        </div>
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">48h rule</h3>
          <AutoArchiveRunner />
        </div>
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Archive by age (all inbox)</h3>
          <ArchiveByDaysRunner />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Per-category actions</h2>
        <p className="text-zinc-400 text-sm">
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
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 w-40"
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
            >
              Create category
            </button>
          </form>
          <Link
            href={params.import === "gmail" ? "/settings/declutter" : "/settings/declutter?import=gmail"}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {params.import === "gmail" ? "← Back" : "Import from Gmail"}
          </Link>
          <Link
            href="/settings/categories"
            className="text-sm text-zinc-500 hover:text-zinc-400"
          >
            Manage all categories →
          </Link>
        </div>
        {params.import === "gmail" && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-300">Gmail labels (all accounts)</h3>
              <Link
                href="/settings/declutter"
                className="text-zinc-500 hover:text-zinc-300 text-sm"
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
                      <div className="text-xs font-medium text-zinc-500 mb-2 truncate">
                        {accountEmail}
                      </div>
                      <ul className="space-y-2">
                        {labels.map((label) => {
                          const linked = categories.some((c) => c.gmailLabelId === label.id);
                          return (
                            <li
                              key={`${accResult.accountId}-${label.id}`}
                              className="flex items-center justify-between gap-3 rounded border border-zinc-700 px-3 py-2"
                            >
                              <span className="text-zinc-200 truncate">{label.name}</span>
                              {linked ? (
                                <span className="text-emerald-500 text-xs shrink-0">Linked</span>
                              ) : (
                                <form action={addCategoryFromGmail}>
                                  <input type="hidden" name="gmailLabelId" value={label.id} />
                                  <input type="hidden" name="name" value={label.name} />
                                  <button
                                    type="submit"
                                    className="text-sm text-amber-500 hover:text-amber-400"
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
              <p className="text-zinc-500 text-sm">No user labels in Gmail. Create labels in Gmail first.</p>
            ) : accounts.length === 0 ? (
              <p className="text-zinc-500 text-sm">Connect a Google account first.</p>
            ) : null}
          </div>
        )}
        {categories.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            Add categories in{" "}
            <Link href="/setup?step=4" className="text-amber-500 hover:underline">
              Setup
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

      <section id="email-actions" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-medium">Email Actions</h2>
        <p className="text-zinc-400 text-sm">
          Per-email rules: when an email matches a sender or domain, auto-categorize it. Suggest → Approve once → auto-apply next time.{" "}
          <strong>Unsubscribe</strong> (Newsletters/Promotions) appears here on suggestions and in the Brief&apos;s Declutter section.
        </p>
        {suggestions.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h3 className="text-base font-medium text-zinc-300">Suggested rules</h3>
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                {suggestions.length} to review
              </span>
            </div>
            <p className="text-zinc-500 text-sm mb-4">
              <strong className="text-emerald-500/90">Accept</strong> = looks good, clear it. Choose a category and click <strong className="text-amber-400/90">Create person rule</strong> or <strong className="text-amber-400/90">Create domain rule</strong> to save.
            </p>
            <ul className="space-y-3">
              {suggestions.map((s) => (
                <SuggestionRow
                  key={s.id}
                  id={s.id}
                  from={s.from}
                  snippet={s.snippet}
                  categoryName={s.categoryName}
                  categoryId={suggestedEvents.find((e) => e.id === s.id)!.classificationCategoryId!}
                  confidence={s.confidence}
                  band={s.band}
                  hasSender={!!s.email && !knownEmails.has(s.email)}
                  hasDomain={!!s.domain && !knownDomains.has(s.domain)}
                  categories={categories}
                />
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-6 py-8 text-center">
            <p className="text-emerald-400/90 font-medium">All clear!</p>
            <p className="text-zinc-500 text-sm mt-1">No rules to review. Your queue is empty.</p>
          </div>
        )}
        <h3 className="text-base font-medium text-zinc-300 mt-6">Sender rules</h3>
        {personRules.length === 0 ? (
          <p className="text-zinc-500 text-sm">No sender rules yet.</p>
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
        <h3 className="text-base font-medium text-zinc-300 mt-6">Domain rules</h3>
        {orgRules.length === 0 ? (
          <p className="text-zinc-500 text-sm">No domain rules yet.</p>
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
      </section>

      <p className="text-zinc-500 text-sm">
        <Link href="/brief" className="hover:text-zinc-400">
          ← Back to Brief
        </Link>
      </p>
    </div>
  );
}
