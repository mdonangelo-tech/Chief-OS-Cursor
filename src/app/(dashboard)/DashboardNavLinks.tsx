"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const NAV: NavItem[] = [
  {
    href: "/brief",
    label: "Brief",
    isActive: (p) => p === "/brief" || p.startsWith("/brief/"),
  },
  {
    href: "/settings",
    label: "Settings",
    isActive: (p) => p === "/settings" || p.startsWith("/settings/"),
  },
];

export function DashboardNavLinks() {
  const pathname = usePathname() || "/";

  return (
    <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
      {NAV.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-surface2/70 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

