import Link from "next/link";

interface SyncStatus {
  gmailSyncAt: string | null;
  calendarSyncAt: string | null;
  accountsCount: number;
  hasSyncErrors: boolean;
}

interface LlmStatus {
  enabled: boolean;
  provider: string;
  model: string;
}

function minsAgo(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export function BriefHeader({
  syncStatus,
  llmStatus,
}: {
  syncStatus: SyncStatus;
  llmStatus: LlmStatus;
}) {
  return (
    <p className="text-zinc-500 text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>Synced: Gmail {minsAgo(syncStatus.gmailSyncAt)} · Calendar {minsAgo(syncStatus.calendarSyncAt)}</span>
      <span>· Accounts: {syncStatus.accountsCount}</span>
      <span>· LLM: {llmStatus.enabled ? `On (${llmStatus.provider})` : "Off"}</span>
      {syncStatus.hasSyncErrors && (
        <Link
          href="/settings/accounts"
          className="text-amber-500 hover:text-amber-400"
          title="Sync errors"
        >
          ⚠
        </Link>
      )}
    </p>
  );
}
