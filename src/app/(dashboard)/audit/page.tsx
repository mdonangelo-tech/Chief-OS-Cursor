import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { rollbackArchive, rollbackSpam } from "@/services/gmail/actions";
import { rollbackRunAction } from "@/lib/brief-actions";
import { GMAIL_CHIEFOS_ARCHIVED_URL } from "@/services/gmail/labels";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const logs = await prisma.auditLog.findMany({
    where: { userId: session.user.id },
    include: { googleAccount: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  const runsWithLogs = new Map<string, typeof logs>();
  for (const log of logs) {
    if (log.runId && log.rollbackStatus === "applied") {
      if (!runsWithLogs.has(log.runId)) runsWithLogs.set(log.runId, []);
      runsWithLogs.get(log.runId)!.push(log);
    }
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
          Inspect past archive actions and undo when needed.{" "}
          <a
            href={GMAIL_CHIEFOS_ARCHIVED_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 hover:underline"
          >
            View all ChiefOS/Archived in Gmail →
          </a>
        </p>
      </div>

      {runsWithLogs.size > 0 && (
        <section>
          <h2 className="text-lg font-medium text-zinc-200 mb-3">Runs</h2>
          <ul className="space-y-3">
            {Array.from(runsWithLogs.entries()).map(([runId, runLogs]) => (
              <li key={runId} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-400 text-sm">
                    {runLogs[0]?.timestamp.toLocaleString()} — {runLogs.length} items
                  </span>
                  <form action={rollbackRunAction}>
                    <input type="hidden" name="runId" value={runId} />
                    <button type="submit" className="text-sm text-amber-500 hover:text-amber-400">
                      Undo entire run
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {logs.length === 0 ? (
        <p className="text-zinc-500">No Gmail actions yet.</p>
      ) : (
        <>
          <h2 className="text-lg font-medium text-zinc-200 mb-3">All entries</h2>
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
                    {log.timestamp.toLocaleString()}
                    {log.rollbackStatus === "reverted" && (
                      <span className="ml-2 text-amber-600">Reverted</span>
                    )}
                  </div>
                </div>
                {log.rollbackStatus === "applied" && log.messageId && (
                  <form
                    action={async () => {
                      "use server";
                      if (log.actionType === "SPAM") {
                        await rollbackSpam(session.user!.id!, log.id);
                      } else {
                        await rollbackArchive(session.user!.id!, log.id);
                      }
                      redirect("/audit");
                    }}
                  >
                    <button
                      type="submit"
                      className="text-sm text-amber-500 hover:text-amber-400"
                    >
                      Undo
                    </button>
                  </form>
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
