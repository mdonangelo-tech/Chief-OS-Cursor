import Link from "next/link";
import { BriefSyncControls } from "./BriefSyncControls";
import { RelativeSyncStatus } from "./RelativeSyncStatus";

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

export function BriefHeader({
  syncStatus,
  llmStatus,
}: {
  syncStatus: SyncStatus;
  llmStatus: LlmStatus;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
        <RelativeSyncStatus
          gmailSyncAt={syncStatus.gmailSyncAt}
          calendarSyncAt={syncStatus.calendarSyncAt}
        />
        <span>· Accounts: {syncStatus.accountsCount}</span>
        <span>· LLM: {llmStatus.enabled ? `On (${llmStatus.provider})` : "Off"}</span>
        {syncStatus.hasSyncErrors && (
          <Link
            href="/settings/accounts"
            className="text-accent hover:text-accent/80"
            title="Sync errors"
          >
            Sync issues
          </Link>
        )}
      </div>

      <BriefSyncControls />
    </div>
  );
}
