"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import { bestCondition, conditionLabel } from "@/lib/rules";
import type { UnitCondition } from "@/lib/types";

export type CatalogItem = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  image?: string;
  /** Availability per size, with the condition the member would receive. */
  sizes: { size: string; count: number; condition: UnitCondition }[];
  favorited: boolean;
  inBox: boolean;
};

/**
 * Members-only catalogue. Sizes shown are live availability; picking one calls
 * the API, which reserves a specific physical unit and enforces the tier limit.
 */
export function Catalog({
  items,
  itemLimit,
  boxCount,
  defaultSize,
}: {
  items: CatalogItem[];
  itemLimit: number;
  boxCount: number;
  defaultSize?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<string>(
    defaultSize &&
      items.some((i) => i.sizes.some((s) => s.size === defaultSize))
      ? defaultSize
      : "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inBox, setInBox] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.inBox).map((i) => i.id)),
  );
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.favorited).map((i) => i.id)),
  );
  const [picked, setPicked] = useState(boxCount);

  const allSizes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) for (const s of item.sizes) set.add(s.size);
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (sizeFilter && !item.sizes.some((s) => s.size === sizeFilter))
        return false;
      if (!term) return true;
      return [item.title, item.brand, item.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, search, sizeFilter]);

  const full = picked >= itemLimit;

  async function addToBox(productId: string, size: string) {
    setError(null);
    setBusy(`${productId}:${size}`);

    try {
      const res = await fetch("/api/portal/box", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, size }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not add that piece.");
        return;
      }

      setInBox((prev) => new Set(prev).add(productId));
      setPicked((body.box?.holds?.length as number) ?? picked + 1);
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleFavorite(productId: string) {
    setError(null);
    try {
      const res = await fetch("/api/portal/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) return;

      setFavorites((prev) => {
        const next = new Set(prev);
        if (body.favorited) next.add(productId);
        else next.delete(productId);
        return next;
      });
    } catch {
      // Favoriting is non-critical; stay quiet on failure.
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search the closet"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search the closet"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSizeFilter("")}
            className={`pill border ${
              sizeFilter === ""
                ? "border-ink bg-ink text-cream"
                : "border-line bg-card text-stone hover:border-accent"
            }`}
          >
            All sizes
          </button>
          {allSizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setSizeFilter(size)}
              className={`pill border ${
                sizeFilter === size
                  ? "border-ink bg-ink text-cream"
                  : "border-line bg-card text-stone hover:border-accent"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-stone">
        {picked} of {itemLimit} items picked
        {full ? " — your box is full for this month." : ""}
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="mt-16 text-center text-stone">
          Nothing matches that yet. Try another size or search.
        </p>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const isInBox = inBox.has(item.id);
            const isFavorite = favorites.has(item.id);

            return (
              <li key={item.id} className="card overflow-hidden">
                <div className="relative">
                  <ProductImage
                    src={item.image}
                    alt={item.title}
                    className="h-64 w-full"
                  />
                  <button
                    type="button"
                    onClick={() => toggleFavorite(item.id)}
                    aria-label={
                      isFavorite ? "Remove from favorites" : "Save to favorites"
                    }
                    aria-pressed={isFavorite}
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 text-base shadow-sm transition hover:scale-105"
                  >
                    <span
                      className={isFavorite ? "text-accent-dark" : "text-stone"}
                    >
                      {isFavorite ? "★" : "☆"}
                    </span>
                  </button>
                </div>

                <div className="p-5">
                  <h3 className="font-medium">{item.title}</h3>
                  {item.brand ? (
                    <p className="mt-0.5 text-sm text-stone">{item.brand}</p>
                  ) : null}

                  {item.sizes.length > 0 ? (
                    <p className="mt-2 text-xs uppercase tracking-wider text-accent-dark">
                      {conditionLabel(
                        item.sizes
                          .map((s) => s.condition)
                          .reduce((a, b) => bestCondition(a, b)),
                      )}
                    </p>
                  ) : null}

                  {isInBox ? (
                    <p className="mt-4 text-sm font-medium text-accent-dark">
                      In your box
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {item.sizes.map(({ size, count, condition }) => (
                        <button
                          key={size}
                          type="button"
                          disabled={full || busy !== null}
                          onClick={() => addToBox(item.id, size)}
                          title={`${count} available in size ${size} · ${conditionLabel(condition)}`}
                          className="btn-outline btn-sm"
                        >
                          {busy === `${item.id}:${size}` ? "Adding…" : size}
                        </button>
                      ))}
                      {item.sizes.length === 0 ? (
                        <span className="text-sm text-stone">
                          All out on loan right now
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
