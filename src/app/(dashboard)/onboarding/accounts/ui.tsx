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

export function OnboardingAccountsClient({ items }: { items: Item[] }) {
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
        <p className="text-zinc-400 mt-1">
          Include all accounts by default. You can re-run onboarding later after adding more.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-400">
        Included in this scan: <strong className="text-zinc-200">{includedCount}</strong> /{" "}
        {rows.length}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.googleAccountId}
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-200">{r.email}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {r.label ? `Label: ${r.label}` : "No label"}
                  {r.stored ? " · Saved" : " · Not saved yet"}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
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
              <label className="text-xs text-zinc-500">
                Account type
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
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

              <label className="text-xs text-zinc-500">
                Display name (optional)
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  defaultValue={r.displayName ?? ""}
                  disabled={savingId !== null}
                  onBlur={(e) =>
                    save(r.googleAccountId, { displayName: e.target.value.trim() || null })
                  }
                />
              </label>

              <label className="text-xs text-zinc-500">
                Primary
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={savingId !== null || r.isPrimary}
                    onClick={() => save(r.googleAccountId, { isPrimary: true })}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
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
        <Link
          href="/onboarding/goals"
          className="inline-block rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
        >
          Continue
        </Link>
        <Link href="/settings/accounts" className="text-sm text-zinc-400 hover:text-zinc-200">
          Add another account
        </Link>
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

