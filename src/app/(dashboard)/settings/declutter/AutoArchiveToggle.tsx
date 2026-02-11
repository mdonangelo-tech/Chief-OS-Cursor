"use client";

import { useState } from "react";

interface AutoArchiveToggleProps {
  enabled: boolean;
  disableForm: React.ReactNode;
  enableForm: React.ReactNode;
}

export function AutoArchiveToggle({ enabled, disableForm, enableForm }: AutoArchiveToggleProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 max-w-md">
        <p className="text-amber-200 text-sm font-medium mb-2">
          First time enabling auto-archive
        </p>
        <p className="text-zinc-400 text-sm mb-4">
          Emails 48h+ old in categories with &quot;Archive after 48h&quot; will be
          auto-archived. All actions are audited—you can undo individual items or
          an entire run from the Audit page. Protected categories (Work, Job
          Search, Portfolio, Kids logistics) are never auto-archived.
        </p>
        <div className="flex gap-2">
          {enableForm}
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (enabled) {
    return <>{disableForm}</>;
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-300 hover:bg-zinc-600"
    >
      Enable auto-archive
    </button>
  );
}
