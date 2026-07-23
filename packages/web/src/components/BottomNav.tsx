"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search, MessageCircle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: House },
  { href: "/search", label: "Search", icon: Search },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/me", label: "Profile", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  const hideOnThread = pathname.startsWith("/messages/") && pathname !== "/messages";

  if (hideOnThread) return null;

  return (
    <nav className="z-50 flex w-full shrink-0 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3 text-[10px] tracking-wide",
              active ? "text-white" : "text-[var(--muted)]",
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
