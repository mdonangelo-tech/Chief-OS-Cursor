"use client";

import { useState } from "react";

function isValidEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 3 || e.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function WaitlistClient({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail.trim());
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!isValidEmail(email)) {
      setStatus("error");
      setError("Please enter a valid email.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed");
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">ChiefOS is private for now.</h1>
        <p className="text-center text-sm text-zinc-400">
          Join the waitlist to get notified when we open up more invites.
        </p>

        {status === "success" ? (
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-4 text-emerald-200 text-sm">
            You’re on the waitlist. Check your email for confirmation.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />

            <button
              type="button"
              onClick={submit}
              disabled={status === "loading"}
              className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50"
            >
              {status === "loading" ? "Joining…" : "Join waitlist"}
            </button>

            {status === "error" && error && (
              <div className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

