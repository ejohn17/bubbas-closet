"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { listOpenedFrom, markReturningTo } from "@/lib/catalog-return";

/** Lists a piece can be opened from, and what the way back is called. */
const LIST_LABELS: Record<string, string> = {
  "/closet": "The closet",
  "/portal": "The closet",
  "/portal/favorites": "Favorites",
};

/**
 * The "← The closet" link on a piece's page. When the piece was opened from a
 * catalogue list, this returns to that list and the list scrolls back to the
 * card that was opened. Otherwise (a shared link, a fresh tab) it's a plain
 * link to `href`. The browser's Back button gets the same restore.
 */
export function BackToListLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const openedFrom = listOpenedFrom(pathname);
  const restoring = openedFrom !== null && openedFrom in LIST_LABELS;
  const target = restoring ? openedFrom : href;

  useEffect(() => {
    const onPopState = () => markReturningTo(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <Link
      href={target}
      // The list scrolls itself to the right card; don't jump to the top first.
      scroll={!restoring}
      onNavigate={() => {
        if (restoring) markReturningTo(target);
      }}
      className="text-sm text-stone transition hover:text-ink"
    >
      ← {restoring ? LIST_LABELS[target] : label}
    </Link>
  );
}
