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
      <div className="rounded-2xl border border-border/10 bg-surface/60 p-4 max-w-md shadow-soft">
        <p className="text-foreground text-sm font-medium mb-2">
          First time enabling auto-archive
        </p>
        <p className="text-muted-foreground text-sm mb-4">
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
            className="rounded-xl border border-border/10 bg-surface/50 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
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
      className="rounded-xl bg-surface2/70 px-4 py-2 font-medium text-foreground hover:opacity-90 shadow-soft"
    >
      Enable auto-archive
    </button>
  );
}
