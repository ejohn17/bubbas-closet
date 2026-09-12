"use client";

import { useState } from "react";

export function FavoriteButton({
  productId,
  favorited,
  className = "",
}: {
  productId: string;
  favorited: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(favorited);

  async function toggle() {
    try {
      const res = await fetch("/api/portal/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) return;
      setOn(Boolean(body.favorited));
    } catch {
      // Favoriting is non-critical; stay quiet on failure.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? "Remove from favorites" : "Save to favorites"}
      aria-pressed={on}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-card/90 text-base shadow-sm transition hover:scale-105 ${className}`}
    >
      <span className={on ? "text-accent-dark" : "text-stone"}>
        {on ? "★" : "☆"}
      </span>
    </button>
  );
}
