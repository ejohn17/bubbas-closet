"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { listOpenedFrom, markReturningTo } from "@/lib/list-return";

/** Lists a detail page can be opened from, and what the way back is called. */
const LIST_LABELS: Record<string, string> = {
  "/closet": "The closet",
  "/portal": "The closet",
  "/portal/favorites": "Favorites",
  "/admin": "Overview",
  "/admin/products": "Products",
  "/admin/units": "Inventory",
  "/admin/orders": "Orders",
};

/**
 * The "← …" link at the top of a detail page. When the page was opened from
 * a ReturnableList, this goes back to that list, filters included, and the
 * list scrolls back to the row that was opened. Otherwise (a shared link, a
 * fresh tab) it's a plain link to `href`.
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
  const openedLabel = openedFrom
    ? LIST_LABELS[openedFrom.split("?")[0]]
    : undefined;
  const back =
    openedFrom && openedLabel ? { href: openedFrom, label: openedLabel } : null;

  return (
    <Link
      href={back?.href ?? href}
      // The list scrolls itself to the right row; don't jump to the top first.
      scroll={!back}
      onNavigate={() => {
        if (back) markReturningTo(back.href);
      }}
      className="text-sm text-stone transition hover:text-ink"
    >
      ← {back?.label ?? label}
    </Link>
  );
}
