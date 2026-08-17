"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portal", label: "Browse" },
  { href: "/portal/box", label: "My box" },
  { href: "/portal/favorites", label: "Favorites" },
  { href: "/portal/orders", label: "Rentals" },
  { href: "/portal/account", label: "Account" },
];

export function PortalNav({ boxCount }: { boxCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {LINKS.map((link) => {
        const active =
          link.href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 transition ${
              active
                ? "bg-ink text-cream"
                : "text-stone hover:bg-line/60 hover:text-ink"
            }`}
          >
            {link.label}
            {link.href === "/portal/box" && boxCount > 0 ? (
              <span className="ml-1.5 text-xs">({boxCount})</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
