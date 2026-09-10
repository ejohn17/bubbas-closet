"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatHoldCountdown } from "@/lib/format";

const URGENT_MS = 2 * 60_000;

export function useHoldClock(expiresAt: number | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const remaining = expiresAt === null ? 0 : Math.max(0, expiresAt - now);
  return {
    remaining,
    expired: expiresAt !== null && remaining <= 0,
    urgent: remaining > 0 && remaining <= URGENT_MS,
    label: expiresAt === null ? "" : formatHoldCountdown(expiresAt, now),
  };
}

/**
 * Live reservation timer while a member is still building their box.
 * Stays in the portal chrome so it's visible while browsing and on favorites.
 */
export function HoldBanner({
  expiresAt,
  itemCount,
}: {
  expiresAt: number;
  itemCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { expired, urgent, label } = useHoldClock(expiresAt);
  const refreshed = useRef(false);
  const onBox = pathname.startsWith("/portal/box");
  const pieces = itemCount === 1 ? "piece is" : "pieces are";

  useEffect(() => {
    if (!expired || refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [expired, router]);

  // The box page has its own reservation card; keep this bar for browse.
  if (onBox) return null;

  return (
    <div
      className={`border-b px-6 py-3 text-sm ${
        expired
          ? "border-red-200 bg-red-50 text-red-900"
          : urgent
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-line bg-card text-ink"
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        {expired ? (
          <p>
            Your reservation ran out. These pieces may already be back in the
            closet — refresh to start a new box.
          </p>
        ) : (
          <p>
            {urgent ? "Hurry — " : ""}
            {itemCount} {pieces} reserved for{" "}
            <span className="tabular-nums font-semibold">{label}</span>. Confirm
            your box before they go back to the closet.
          </p>
        )}

        <div className="flex items-center gap-2">
          {expired ? (
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => router.refresh()}
            >
              Refresh
            </button>
          ) : (
            <Link href="/portal/box" className="btn-primary btn-sm">
              Review box
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
