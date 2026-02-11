"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Sign-in configuration error",
    description:
      "Google sign-in is misconfigured. This often means the Client ID or Client Secret in .env is wrong, or the redirect URI in Google Cloud Console doesn't exactly match: http://localhost:3000/api/auth/callback/google. Verify your credentials and try signing in again.",
  },
  AccessDenied: {
    title: "Access denied",
    description: "You don't have permission to sign in.",
  },
  Verification: {
    title: "Verification failed",
    description: "The sign-in link may have expired or already been used.",
  },
  Default: {
    title: "Something went wrong",
    description: "An unexpected error occurred during sign-in.",
  },
};

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? "Default";
  const { title, description } =
    ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;

  return (
    <>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-center text-zinc-400">{description}</p>
      <Link
        href="/login"
        className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-500"
      >
        Back to login
      </Link>
    </>
  );
}

export default function AuthErrorPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 bg-zinc-950 text-zinc-100">
      <Suspense fallback={<p className="text-zinc-400">Loading…</p>}>
        <AuthErrorContent />
      </Suspense>
    </main>
  );
}
