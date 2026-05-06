import { redirect } from "next/navigation";
import { getRecentMagicLinks } from "@/lib/email";

/**
 * Dev-only page: lists recent magic links sent by the console provider.
 * Gated to non-production via NODE_ENV check.
 */
export default async function DevMagicLinksPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/");
  }

  const links = getRecentMagicLinks();

  return (
    <div className="min-h-screen bg-background text-foreground p-8 font-mono">
      <h1 className="text-xl font-semibold mb-2">ChiefOS Dev: Magic Links</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Recent magic links (console provider). Only visible when NODE_ENV ≠
        production.
      </p>
      {links.length === 0 ? (
        <p className="text-muted-foreground">No magic links sent yet.</p>
      ) : (
        <ul className="space-y-4">
          {links.map((link, i) => (
            <li
              key={`${link.createdAt}-${i}`}
              className="border border-border/10 rounded-2xl p-4 bg-surface/60 shadow-soft"
            >
              <div className="text-muted-foreground text-xs mb-1">{link.createdAt}</div>
              <div className="mb-2">
                <span className="text-muted-foreground">To:</span> {link.email}
              </div>
              <a
                href={link.url}
                className="text-accent hover:underline break-all"
              >
                {link.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
