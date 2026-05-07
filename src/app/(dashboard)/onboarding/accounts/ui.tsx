"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-base";

type AccountType = "work" | "personal" | "unknown";

type Item = {
  googleAccountId: string;
  email: string;
  label: string | null;
  stored: boolean;
  accountType: AccountType;
  isPrimary: boolean;
  includeInOnboarding: boolean;
  displayName: string | null;
};

export function OnboardingAccountsClient({
  items,
  dbWarning,
  readOnly,
  mode = "onboarding",
}: {
  items: Item[];
  dbWarning: string | null;
  readOnly: boolean;
  mode?: "onboarding" | "settings" | "setup";
}) {
  const flowBase =
    mode === "setup" ? "/settings/personal/setup" : "/onboarding";
  const [rows, setRows] = useState<Item[]>(items);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(
    null
  );

  const includedCount = useMemo(
    () => rows.filter((r) => r.includeInOnboarding).length,
    [rows]
  );

  function showToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function save(googleAccountId: string, patch: Partial<Item>) {
    if (readOnly) {
      showToast("error", "Onboarding preferences are read-only until DB migrations are applied.");
      return;
    }
    setSavingId(googleAccountId);
    try {
      const current = rows.find((r) => r.googleAccountId === googleAccountId);
      if (!current) return;

      const next = { ...current, ...patch };
      setRows((prev) => prev.map((r) => (r.googleAccountId === googleAccountId ? next : r)));

      const res = await apiFetch("/api/onboarding/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleAccountId,
          accountType: next.accountType,
          isPrimary: next.isPrimary,
          includeInOnboarding: next.includeInOnboarding,
          displayName: next.displayName,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save");

      showToast("success", "Saved");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-muted-foreground mt-1">
          {mode === "settings"
            ? "Set account type and primary account. These preferences shape the Brief and onboarding scans."
            : "Include all accounts by default. You can re-run onboarding later after adding more."}
        </p>
      </div>

      {dbWarning && (
        <div className="rounded-2xl border border-border/10 bg-surface/60 p-4 text-sm text-muted-foreground shadow-soft">
          <div className="font-medium text-foreground">Setup required</div>
          <div className="text-muted-foreground mt-1">{dbWarning}</div>
        </div>
      )}

      <div className="rounded-2xl border border-border/10 bg-surface/60 p-4 text-sm text-muted-foreground shadow-soft">
        Included in this scan: <strong className="text-foreground">{includedCount}</strong> /{" "}
        {rows.length}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.googleAccountId}
            className="rounded-2xl border border-border/10 bg-surface/60 p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">{r.email}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.label ? `Label: ${r.label}` : "No label"}
                  {r.stored ? " · Saved" : " · Not saved yet"}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground/90">
                <input
                  type="checkbox"
                  checked={r.includeInOnboarding}
                  disabled={savingId !== null}
                  onChange={(e) =>
                    save(r.googleAccountId, { includeInOnboarding: e.target.checked })
                  }
                />
                Include
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <label className="text-xs text-muted-foreground">
                Account type
                <select
                  className="mt-1 w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
                  value={r.accountType}
                  disabled={savingId !== null}
                  onChange={(e) =>
                    save(r.googleAccountId, { accountType: e.target.value as AccountType })
                  }
                >
                  <option value="unknown">Unknown</option>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                </select>
              </label>

              <label className="text-xs text-muted-foreground">
                Display name (optional)
                <input
                  className="mt-1 w-full rounded-xl border border-border/10 bg-background px-3 py-2 text-sm text-foreground"
                  defaultValue={r.displayName ?? ""}
                  disabled={savingId !== null}
                  onBlur={(e) =>
                    save(r.googleAccountId, { displayName: e.target.value.trim() || null })
                  }
                />
              </label>

              <label className="text-xs text-muted-foreground">
                Primary
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={savingId !== null || r.isPrimary}
                    onClick={() => save(r.googleAccountId, { isPrimary: true })}
                    className="rounded-xl border border-border/10 bg-surface/50 px-3 py-2 text-sm text-foreground hover:bg-surface2/60 disabled:opacity-50"
                  >
                    {r.isPrimary ? "Primary" : "Set primary"}
                  </button>
                </div>
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {mode === "onboarding" || mode === "setup" ? (
          <>
            <Link
              href={`${flowBase}/goals`}
              className="inline-block rounded-xl bg-accent px-4 py-2 text-accent-foreground font-medium hover:opacity-90"
            >
              Continue
            </Link>
            <Link href="/settings/accounts" className="text-sm text-muted-foreground hover:text-foreground">
              Add another account
            </Link>
          </>
        ) : (
          <Link href="/settings/accounts" className="text-sm text-muted-foreground hover:text-foreground">
            Manage connected accounts →
          </Link>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg px-4 py-2 text-sm shadow-lg ${
            toast.kind === "success"
              ? "bg-emerald-900/80 text-emerald-200 border border-emerald-700"
              : "bg-red-950/80 text-red-200 border border-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

