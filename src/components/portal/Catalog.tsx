"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { FavoriteButton } from "@/components/portal/FavoriteButton";
import { AddToBoxControls } from "@/components/portal/AddToBoxControls";
import { bestCondition, conditionLabel } from "@/lib/rules";
import type { CatalogItem } from "@/lib/catalog";

export type { CatalogItem };

/**
 * Members-only catalogue. Cards open the piece for photos and description;
 * adding a size is a separate labelled action.
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
  const [search, setSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<string>(
    defaultSize &&
      items.some((i) => i.sizes.some((s) => s.size === defaultSize))
      ? defaultSize
      : "",
  );
  const inBox = useMemo(
    () => new Set(items.filter((i) => i.inBox).map((i) => i.id)),
    [items],
  );

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
      return [item.title, item.brand, item.category, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, search, sizeFilter]);

  const picked = boxCount;
  const full = picked >= itemLimit;

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

      {visible.length === 0 ? (
        <p className="mt-16 text-center text-stone">
          Nothing matches that yet. Try another size or search.
        </p>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const isInBox = inBox.has(item.id);
            const href = `/portal/item/${item.id}`;
            const condition =
              item.sizes.length > 0
                ? item.sizes
                    .map((s) => s.condition)
                    .reduce((a, b) => bestCondition(a, b))
                : null;

            return (
              <li
                key={item.id}
                className="card overflow-hidden transition hover:border-accent/60"
              >
                <div className="relative">
                  <Link href={href} className="group block">
                    <ProductImage
                      src={item.images[0]}
                      alt={item.title}
                      className="h-64 w-full transition duration-300 group-hover:scale-[1.03]"
                    />
                    {item.images.length > 1 ? (
                      <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-stone">
                        {item.images.length} photos
                      </span>
                    ) : null}
                  </Link>
                  <FavoriteButton
                    productId={item.id}
                    favorited={item.favorited}
                    className="absolute right-3 top-3 z-10"
                  />
                </div>

                <div className="p-5">
                  <Link href={href} className="group block">
                    <h3 className="font-medium transition group-hover:text-accent-dark">
                      {item.title}
                    </h3>
                    {item.brand ? (
                      <p className="mt-0.5 text-sm text-stone">{item.brand}</p>
                    ) : null}
                    {item.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-stone">
                        {item.description}
                      </p>
                    ) : null}
                    {condition ? (
                      <p className="mt-2 text-xs uppercase tracking-wider text-accent-dark">
                        {conditionLabel(condition)}
                      </p>
                    ) : null}
                  </Link>

                  <div className="mt-4">
                    <AddToBoxControls
                      productId={item.id}
                      sizes={item.sizes}
                      inBox={isInBox}
                      full={full && !isInBox}
                      preferredSize={sizeFilter || defaultSize}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
