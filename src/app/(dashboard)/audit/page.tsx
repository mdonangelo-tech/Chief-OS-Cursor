import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { rollbackArchive, rollbackSpam } from "@/services/gmail/actions";
import { rollbackRunAction } from "@/lib/brief-actions";
import { CHIEFOS_ARCHIVED_LABEL } from "@/services/gmail/labels";
import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

function gmailSearchUrlForAccount(email: string, query: string): string {
  const q = encodeURIComponent(query);
  const authuser = encodeURIComponent(email);
  return `https://mail.google.com/mail/?authuser=${authuser}#search/${q}`;
}

function gmailMessageUrlForAccount(email: string, messageId: string): string {
  const authuser = encodeURIComponent(email);
  return `https://mail.google.com/mail/?authuser=${authuser}#all/${encodeURIComponent(messageId)}`;
}

type SortKey = "action_desc" | "action_asc" | "email_oldest" | "email_newest";

function parsePositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function buildAuditUrl(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/audit?${qs}` : "/audit";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    runId?: string;
    sort?: SortKey;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;

  const params = await searchParams;
  const accountFilter = (params.account ?? "all").trim();
  const runIdFilter = (params.runId ?? "").trim() || null;
  const sort: SortKey = (params.sort ?? "action_desc") as SortKey;
  const pageSizeRaw = (params.pageSize ?? "10").trim();
  const pageSize =
    pageSizeRaw === "all" ? "all" : Math.min(50, Math.max(10, parsePositiveInt(pageSizeRaw, 10)));
  const page = parsePositiveInt(params.page, 1);

  const accounts = await prisma.googleAccount.findMany({
    where: { userId },
    select: { id: true, email: true, syncStateJson: true },
    orderBy: { createdAt: "asc" },
  });
  const accountIds = new Set(accounts.map((a) => a.id));
  const selectedAccountId =
    accountFilter !== "all" && accountIds.has(accountFilter) ? accountFilter : null;

  const whereBase: Prisma.AuditLogWhereInput = {
    userId,
    ...(selectedAccountId ? { googleAccountId: selectedAccountId } : {}),
    ...(runIdFilter ? { runId: runIdFilter } : {}),
  };

  const totalEntries = await prisma.auditLog.count({ where: whereBase });
  const totalPages =
    pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalEntries / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = pageSize === "all" ? 0 : (safePage - 1) * pageSize;
  const take = pageSize === "all" ? Math.min(totalEntries, 500) : pageSize;

  const accountCounts = await prisma.auditLog.groupBy({
    by: ["googleAccountId"],
    where: { userId },
    _count: { _all: true },
  });
  const countByAccountId = new Map(accountCounts.map((r) => [r.googleAccountId, r._count._all]));

  let logs: Array<
    Prisma.AuditLogGetPayload<{ include: { googleAccount: true } }>
  > = [];

  if (sort === "email_oldest" || sort === "email_newest") {
    const direction = sort === "email_oldest" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT al."id"
      FROM "AuditLog" al
      LEFT JOIN "EmailEvent" ee ON ee."messageId" = al."messageId"
      WHERE al."userId" = ${userId}
        ${selectedAccountId ? Prisma.sql`AND al."googleAccountId" = ${selectedAccountId}` : Prisma.empty}
        ${runIdFilter ? Prisma.sql`AND al."runId" = ${runIdFilter}` : Prisma.empty}
      ORDER BY ee."date" ${direction} NULLS LAST, al."timestamp" DESC
      LIMIT ${take} OFFSET ${skip}
    `);
    const idList = ids.map((r) => r.id);
    const fetched = idList.length
      ? await prisma.auditLog.findMany({
          where: { id: { in: idList } },
          include: { googleAccount: true },
        })
      : [];
    const byId = new Map(fetched.map((l) => [l.id, l]));
    logs = idList.map((id) => byId.get(id)).filter(Boolean) as typeof logs;
  } else {
    logs = await prisma.auditLog.findMany({
      where: whereBase,
      include: { googleAccount: true },
      orderBy: { timestamp: sort === "action_asc" ? "asc" : "desc" },
      take,
      skip,
    });
  }

  const topRuns = await prisma.auditLog.groupBy({
    by: ["runId"],
    where: {
      userId,
      runId: { not: null },
      rollbackStatus: "applied",
      ...(selectedAccountId ? { googleAccountId: selectedAccountId } : {}),
    },
    _count: { _all: true },
    _max: { timestamp: true },
    orderBy: { _max: { timestamp: "desc" } },
    take: 10,
  });
  const runIds = topRuns.map((r) => r.runId).filter((x): x is string => !!x);
  const runBreakdowns = runIds.length
    ? await prisma.auditLog.groupBy({
        by: ["runId", "actionType"],
        where: { userId, runId: { in: runIds }, rollbackStatus: "applied" },
        _count: { _all: true },
      })
    : [];
  const runAccounts = runIds.length
    ? await prisma.auditLog.groupBy({
        by: ["runId", "googleAccountId"],
        where: { userId, runId: { in: runIds }, rollbackStatus: "applied" },
        _count: { _all: true },
      })
    : [];
  const runActionCounts = new Map<string, Record<string, number>>();
  for (const row of runBreakdowns) {
    if (!row.runId) continue;
    if (!runActionCounts.has(row.runId)) runActionCounts.set(row.runId, {});
    runActionCounts.get(row.runId)![row.actionType] = row._count._all;
  }
  const runAccountIds = new Map<string, Set<string>>();
  for (const row of runAccounts) {
    if (!row.runId) continue;
    if (!runAccountIds.has(row.runId)) runAccountIds.set(row.runId, new Set());
    runAccountIds.get(row.runId)!.add(row.googleAccountId);
  }

  const messageIds = logs
    .map((l) => l.messageId)
    .filter((id): id is string => !!id);
  const emailEvents = messageIds.length
    ? await prisma.emailEvent.findMany({
        where: { messageId: { in: messageIds } },
        select: {
          messageId: true,
          from_: true,
          subject: true,
          snippet: true,
          date: true,
          labels: true,
          category: { select: { name: true } },
        },
      })
    : [];
  const emailByMessageId = new Map(emailEvents.map((e) => [e.messageId, e]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Gmail action history</h1>
        <p className="text-zinc-400 mt-1">
          Inspect past archive actions and undo when needed.
        </p>
        <p className="text-zinc-600 text-xs mt-1">
          Note: Gmail labels list messages by <strong>received date</strong>. This page lists actions by <strong>archived/spammed time</strong>.
        </p>
        {accounts.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-zinc-500 text-sm">Accounts</div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildAuditUrl({ account: "all", sort, page: "1", pageSize: pageSizeRaw, runId: runIdFilter ?? undefined })}
                className={`rounded-full border px-3 py-1 text-xs ${
                  !selectedAccountId
                    ? "border-amber-700 bg-amber-950/30 text-amber-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                All ({accounts.reduce((sum, a) => sum + (countByAccountId.get(a.id) ?? 0), 0)})
              </Link>
              {accounts.map((a) => {
                const count = countByAccountId.get(a.id) ?? 0;
                const state = a.syncStateJson as
                  | { authError?: { code?: string } | null; lastSyncResult?: { errors?: string[] } | null; lastCalendarSyncResult?: { errors?: string[] } | null }
                  | null;
                const hasErrors = !!(state?.lastSyncResult?.errors?.length || state?.lastCalendarSyncResult?.errors?.length);
                const needsReconnect = state?.authError?.code === "RECONNECT_REQUIRED";
                const active = selectedAccountId === a.id;
                return (
                  <Link
                    key={a.id}
                    href={buildAuditUrl({ account: a.id, sort, page: "1", pageSize: pageSizeRaw, runId: runIdFilter ?? undefined })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? "border-amber-700 bg-amber-950/30 text-amber-200"
                        : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                    }`}
                    title={
                      needsReconnect
                        ? "Reconnect required"
                        : hasErrors
                          ? "Sync has errors"
                          : count === 0
                            ? "No audit entries yet"
                            : undefined
                    }
                  >
                    {a.email} ({count})
                    {needsReconnect ? " · reconnect" : hasErrors ? " · errors" : ""}
                  </Link>
                );
              })}
            </div>
            <div className="text-zinc-500 text-sm">
              View label in Gmail:{" "}
              {accounts.map((a, i) => (
                <span key={a.email}>
                  {i > 0 ? " · " : ""}
                  <a
                    href={gmailSearchUrlForAccount(a.email, `label:${CHIEFOS_ARCHIVED_LABEL}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-500 hover:underline"
                  >
                    {a.email}
                  </a>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {topRuns.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-zinc-200 mb-3">Runs</h2>
          <p className="text-zinc-500 text-sm mb-3">
            Runs group automated actions. Counts below reflect <strong>all</strong> entries in each run (not just the current page).
          </p>
          <ul className="space-y-3">
            {topRuns.map((r) => {
              const runId = r.runId!;
              const actionCounts = runActionCounts.get(runId) ?? {};
              const archived = actionCounts["ARCHIVE"] ?? 0;
              const spammed = actionCounts["SPAM"] ?? 0;
              const processed = Object.values(actionCounts).reduce((sum, n) => sum + n, 0);
              const runAccIds = Array.from(runAccountIds.get(runId) ?? []);
              const runAccEmails = runAccIds
                .map((id) => accounts.find((a) => a.id === id)?.email)
                .filter(Boolean) as string[];

              return (
                <li key={runId} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-400 text-sm">
                    <LocalTime value={r._max.timestamp} /> — {processed} processed
                    {archived ? ` · ${archived} archived` : ""}
                    {spammed ? ` · ${spammed} spammed` : ""}
                  </span>
                  <div className="flex items-center gap-3">
                    <Link
                      href={buildAuditUrl({ account: selectedAccountId ?? "all", runId, sort, page: "1", pageSize: pageSizeRaw })}
                      className="text-sm text-zinc-500 hover:text-zinc-300"
                    >
                      View entries
                    </Link>
                    <form action={rollbackRunAction}>
                    <input type="hidden" name="runId" value={runId} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={buildAuditUrl({ account: selectedAccountId ?? "all", sort, page: String(safePage), pageSize: pageSizeRaw, runId: runIdFilter ?? undefined })}
                    />
                    <button type="submit" className="text-sm text-amber-500 hover:text-amber-400">
                      Undo entire run
                    </button>
                  </form>
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  Run {runId}
                  {runAccEmails.length > 0 ? ` · ${runAccEmails.join(" · ")}` : ""}
                </div>
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {logs.length === 0 ? (
        <p className="text-zinc-500">No Gmail actions yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-zinc-200">All entries</h2>
              <div className="text-zinc-500 text-sm mt-1">
                {totalEntries.toLocaleString()} total
                {runIdFilter ? (
                  <>
                    {" · "}
                    <span className="font-mono text-xs">run {runIdFilter}</span>{" "}
                    <Link
                      href={buildAuditUrl({ account: selectedAccountId ?? "all", sort, page: "1", pageSize: pageSizeRaw })}
                      className="text-amber-500 hover:underline"
                    >
                      clear
                    </Link>
                  </>
                ) : null}
                {pageSize === "all" && totalEntries > take ? (
                  <> · showing first {take.toLocaleString()} (use filters for the rest)</>
                ) : null}
              </div>
            </div>

            <form method="get" className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="account" value={selectedAccountId ?? "all"} />
              {runIdFilter && <input type="hidden" name="runId" value={runIdFilter} />}
              <label className="text-zinc-500">
                Sort{" "}
                <select
                  name="sort"
                  defaultValue={sort}
                  className="ml-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  <option value="action_desc">Recently archived (action time)</option>
                  <option value="action_asc">Oldest archived (action time)</option>
                  <option value="email_newest">Newest email date</option>
                  <option value="email_oldest">Oldest email date</option>
                </select>
              </label>
              <label className="text-zinc-500">
                Page size{" "}
                <select
                  name="pageSize"
                  defaultValue={pageSizeRaw}
                  className="ml-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="all">View all</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-200 hover:bg-zinc-800"
              >
                Apply
              </button>
            </form>
          </div>

          {pageSize !== "all" && totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>
                Page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={buildAuditUrl({
                    account: selectedAccountId ?? "all",
                    runId: runIdFilter ?? undefined,
                    sort,
                    page: String(Math.max(1, safePage - 1)),
                    pageSize: pageSizeRaw,
                  })}
                  className={`rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800 ${
                    safePage <= 1 ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  Prev
                </Link>
                <Link
                  href={buildAuditUrl({
                    account: selectedAccountId ?? "all",
                    runId: runIdFilter ?? undefined,
                    sort,
                    page: String(Math.min(totalPages, safePage + 1)),
                    pageSize: pageSizeRaw,
                  })}
                  className={`rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800 ${
                    safePage >= totalPages ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  Next
                </Link>
              </div>
            </div>
          )}

          <ul className="space-y-4">
          {logs.map((log) => {
            const email = log.messageId ? emailByMessageId.get(log.messageId) : null;
            return (
            <li
              key={log.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-200">
                    {log.actionType} — {log.googleAccount.email}
                    {log.reason && (
                      <span className="text-zinc-500 font-normal ml-1">· {log.reason}</span>
                    )}
                  </div>
                  {email ? (
                    <>
                      <div className="text-zinc-300 text-sm mt-1 truncate" title={email.subject ?? undefined}>
                        {decodeHtmlEntities(email.subject ?? "") || "(No subject)"}
                      </div>
                      <div className="text-zinc-500 text-xs mt-0.5 truncate">{decodeHtmlEntities(email.from_)}</div>
                      <div className="text-zinc-600 text-xs mt-0.5">
                        Received <LocalTime value={email.date} />
                      </div>
                      {email.snippet && (
                        <div className="text-zinc-600 text-xs mt-1 line-clamp-2">{decodeHtmlEntities(email.snippet)}</div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {email.category && (
                          <span className="inline-block rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-200">
                            {email.category.name}
                          </span>
                        )}
                        {email.labels.length > 0 && (
                          <span className="text-zinc-600 text-xs">
                            {email.labels.slice(0, 4).join(", ")}
                            {email.labels.length > 4 ? " …" : ""}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-zinc-500 text-sm mt-1">
                      {log.messageId && (
                        <span className="font-mono text-xs">{log.messageId.slice(0, 24)}…</span>
                      )}
                    </div>
                  )}
                  <div className="text-zinc-600 text-xs mt-2">
                    <LocalTime value={log.timestamp} />
                    {log.rollbackStatus === "reverted" && (
                      <span className="ml-2 text-amber-600">Reverted</span>
                    )}
                  </div>
                </div>
                {log.rollbackStatus === "applied" && log.messageId && (
                  <div className="flex flex-col items-end gap-2">
                    <a
                      href={gmailMessageUrlForAccount(log.googleAccount.email, log.messageId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-zinc-400 hover:text-zinc-200"
                    >
                      Open in Gmail
                    </a>
                    <form
                      action={async () => {
                        "use server";
                        if (log.actionType === "SPAM") {
                          await rollbackSpam(session.user!.id!, log.id);
                        } else {
                          await rollbackArchive(session.user!.id!, log.id);
                        }
                        redirect(
                          buildAuditUrl({
                            account: selectedAccountId ?? "all",
                            runId: runIdFilter ?? undefined,
                            sort,
                            page: String(safePage),
                            pageSize: pageSizeRaw,
                          })
                        );
                      }}
                    >
                      <button
                        type="submit"
                        className="text-sm text-amber-500 hover:text-amber-400"
                      >
                        Undo
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </li>
            );
          })}
        </ul>
        </>
      )}

      <p className="text-zinc-500 text-sm">
        <Link href="/brief" className="hover:text-zinc-400">
          ← Back to Brief
        </Link>
      </p>
    </div>
  );
}
