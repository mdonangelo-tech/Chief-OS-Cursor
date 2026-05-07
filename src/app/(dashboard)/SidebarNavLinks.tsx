"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const PRIMARY: NavItem[] = [
  {
    href: "/brief",
    label: "Brief",
    isActive: (p) => p === "/brief" || p.startsWith("/brief/"),
  },
];

const SETTINGS: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    isActive: (p) => p === "/settings" || p.startsWith("/settings/"),
  },
  {
    href: "/settings/personal",
    label: "Personal Context",
    isActive: (p) => p === "/settings/personal" || p.startsWith("/settings/personal/"),
  },
  {
    href: "/settings/accounts",
    label: "Accounts",
    isActive: (p) => p === "/settings/accounts" || p.startsWith("/settings/accounts/"),
  },
  {
    href: "/settings/workspace-sync",
    label: "Workspace & Sync",
    isActive: (p) => p === "/settings/workspace-sync" || p.startsWith("/settings/workspace-sync/"),
  },
  {
    href: "/settings/declutter",
    label: "Declutter",
    isActive: (p) => p === "/settings/declutter" || p.startsWith("/settings/declutter/"),
  },
  {
    href: "/settings/categories",
    label: "Categories",
    isActive: (p) => p === "/settings/categories" || p.startsWith("/settings/categories/"),
  },
  {
    href: "/audit",
    label: "Audit",
    isActive: (p) => p === "/audit" || p.startsWith("/audit/"),
  },
];

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.isActive(pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-surface2/70 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-surface/60",
      ].join(" ")}
    >
      <span className="truncate">{item.label}</span>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-accent/80" aria-hidden="true" />}
    </Link>
  );
}

export function SidebarNavLinks({
  showFinishSetup,
}: {
  showFinishSetup: boolean;
}) {
  const pathname = usePathname() || "/";

  return (
    <nav aria-label="Primary navigation" className="space-y-5">
      <div className="space-y-1">
        <div className="px-3 text-[11px] uppercase tracking-wide text-muted-foreground/70">
          Primary
        </div>
        <div className="space-y-1">
          {PRIMARY.map((item) => (
            <Item key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="px-3 text-[11px] uppercase tracking-wide text-muted-foreground/70">
          Settings
        </div>
        <div className="space-y-1">
          {SETTINGS.map((item) => (
            <Item key={item.href} item={item} pathname={pathname} />
          ))}
          {showFinishSetup && (
            <Link
              href="/settings/personal/setup"
              className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-accent hover:text-accent/80 hover:bg-accent/10 transition-colors"
            >
              <span>Finish setup</span>
              <span className="text-[11px] rounded-full bg-accent/15 px-2 py-0.5">
                New
              </span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

