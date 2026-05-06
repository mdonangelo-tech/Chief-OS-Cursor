import { signIn } from "@/auth";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
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
              className="block text-sm font-medium text-muted-foreground mb-2"
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
              className="w-full px-4 py-2 rounded-xl bg-surface border border-border/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/60"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 rounded-xl bg-accent hover:opacity-90 text-accent-foreground font-medium"
          >
            Sign in with Email
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/10" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-background text-muted-foreground">or</span>
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
            className="w-full py-2 rounded-xl border border-border/10 bg-surface/50 text-foreground hover:bg-surface2/60 font-medium"
          >
            Sign in with Google
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
