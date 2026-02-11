import { signIn } from "@/auth";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">
          Sign in to Chief of Staff
        </h1>

        <form
          action={async (formData: FormData) => {
            "use server";
            const email = formData.get("email") as string;
            if (email) {
              await signIn("chiefos-email", {
                email,
                redirectTo: "/brief",
                redirect: true,
              });
            }
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-400 mb-2"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium"
          >
            Sign in with Email
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-zinc-950 text-zinc-500">or</span>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", {
              redirectTo: "/brief",
              redirect: true,
            });
          }}
        >
          <button
            type="submit"
            className="w-full py-2 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 font-medium"
          >
            Sign in with Google
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-400">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
