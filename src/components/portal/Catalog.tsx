"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FavoriteButton } from "@/components/portal/FavoriteButton";
import { AddToBoxControls } from "@/components/portal/AddToBoxControls";
import { CatalogCarousel } from "@/components/portal/CatalogCarousel";
import { GuestAddPrompt } from "@/components/portal/GuestAddPrompt";
import { CollapsibleFilters } from "@/components/CollapsibleFilters";
import { recommendTierFor } from "@/lib/config";
import { hasTag, matchesLabel, uniqueLabels } from "@/lib/filters";
import { formatDollars } from "@/lib/format";
import { bestCondition, conditionLabel } from "@/lib/rules";
import { compareSizes } from "@/lib/sizes";
import type { CatalogItem } from "@/lib/catalog";

export type { CatalogItem };

/**
 * Who is looking at the closet:
 * - member  — active membership; box capped at the plan limit.
 * - preview — signed in, no membership yet; box leads to plan selection.
 * - guest   — signed out; read-only with a sign-up prompt per piece.
 */
export type CatalogMode = "member" | "preview" | "guest";

/**
 * The catalogue. Cards open the piece for photos and description; adding a
 * size is a separate labelled action. Shared by the members' portal, the
 * pre-subscription preview, and the public /closet.
 */
export function Catalog({
  items,
  itemLimit,
  boxCount,
  defaultSize,
  mode = "member",
}: {
  items: CatalogItem[];
  itemLimit: number;
  boxCount: number;
  defaultSize?: string;
  mode?: CatalogMode;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
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

  const categories = useMemo(
    () => uniqueLabels(items.map((item) => item.category)),
    [items],
  );
  const brands = useMemo(
    () => uniqueLabels(items.map((item) => item.brand)),
    [items],
  );
  const tags = useMemo(
    () => uniqueLabels(items.flatMap((item) => item.tags ?? [])),
    [items],
  );
  const conditions = useMemo(
    () =>
      uniqueLabels(items.flatMap((item) => item.sizes.map((s) => s.condition))),
    [items],
  );
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) for (const s of item.sizes) set.add(s.size);
    return [...set].sort(compareSizes);
  }, [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter && !matchesLabel(item.category, categoryFilter))
        return false;
      if (brandFilter && !matchesLabel(item.brand, brandFilter)) return false;
      if (tagFilter && !hasTag(item.tags, tagFilter)) return false;
      if (inStockOnly && item.sizes.length === 0) return false;
      if (sizeFilter && !item.sizes.some((s) => s.size === sizeFilter))
        return false;
      if (
        conditionFilter &&
        !item.sizes.some((s) => matchesLabel(s.condition, conditionFilter))
      )
        return false;
      if (!term) return true;
      return [item.title, item.brand, item.category, item.description, ...(item.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [
    items,
    search,
    categoryFilter,
    brandFilter,
    tagFilter,
    inStockOnly,
    sizeFilter,
    conditionFilter,
  ]);

  const picked = boxCount;
  const full = mode !== "guest" && picked >= itemLimit;
  const itemBase = mode === "guest" ? "/closet" : "/portal/item";

  return (
    <div>
      <div className="flex flex-col gap-5">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search the closet"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search the closet"
        />

        <FilterRow
          label="Category"
          allLabel="All categories"
          value={categoryFilter}
          options={categories}
          onChange={setCategoryFilter}
        />
        <FilterRow
          label="Brand"
          allLabel="All brands"
          value={brandFilter}
          options={brands}
          onChange={setBrandFilter}
        />
        {tags.length > 0 ? (
          <CollapsibleFilters
            label="Tags"
            summary={
              tagFilter ? (
                <FilterChip active onClick={() => setTagFilter("")}>
                  {tagFilter}
                </FilterChip>
              ) : null
            }
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                active={!tagFilter}
                onClick={() => setTagFilter("")}
              >
                All tags
              </FilterChip>
              {tags.map((option) => (
                <FilterChip
                  key={option}
                  active={tagFilter === option}
                  onClick={() => setTagFilter(option)}
                >
                  {option}
                </FilterChip>
              ))}
            </div>
          </CollapsibleFilters>
        ) : null}
        <FilterRow
          label="Size"
          allLabel="All sizes"
          value={sizeFilter}
          options={allSizes}
          onChange={setSizeFilter}
        />
        <FilterRow
          label="Condition"
          allLabel="All conditions"
          value={conditionFilter}
          options={conditions}
          optionLabel={(value) =>
            conditionLabel(value as Parameters<typeof conditionLabel>[0])
          }
          onChange={setConditionFilter}
        />

        {items.some((item) => item.sizes.length === 0) ? (
          <div>
            <p className="label">Availability</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                active={!inStockOnly}
                onClick={() => setInStockOnly(false)}
              >
                All pieces
              </FilterChip>
              <FilterChip
                active={inStockOnly}
                onClick={() => setInStockOnly(true)}
              >
                In stock
              </FilterChip>
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-stone">
        <BoxStatusLine mode={mode} picked={picked} itemLimit={itemLimit} />
      </p>

      {visible.length === 0 ? (
        <p className="mt-16 text-center text-stone">
          Nothing matches that yet. Try another filter or search.
        </p>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item, cardIndex) => {
            const isInBox = inBox.has(item.id);
            const href = `${itemBase}/${item.id}`;
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
                  <CatalogCarousel
                    images={item.images}
                    alt={item.title}
                    href={href}
                    offsetMs={(cardIndex % 7) * 350}
                  />
                  {mode !== "guest" ? (
                    <FavoriteButton
                      productId={item.id}
                      favorited={item.favorited}
                      className="absolute right-3 top-3 z-10"
                    />
                  ) : null}
                </div>

                <div className="p-5">
                  <Link href={href} className="group block">
                    <h3 className="font-medium transition group-hover:text-accent-dark">
                      {item.title}
                    </h3>
                    {item.brand || item.category ? (
                      <p className="mt-0.5 text-sm text-stone">
                        {[item.brand, item.category].filter(Boolean).join(" · ")}
                      </p>
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
                    {mode === "guest" ? (
                      <GuestAddPrompt productId={item.id} sizes={item.sizes} />
                    ) : (
                      <AddToBoxControls
                        productId={item.id}
                        sizes={item.sizes}
                        inBox={isInBox}
                        full={full && !isInBox}
                        preferredSize={sizeFilter || defaultSize}
                      />
                    )}
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

function FilterRow({
  label,
  allLabel,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: string[];
  optionLabel?: (value: string) => string;
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={!value} onClick={() => onChange("")}>
          {allLabel}
        </FilterChip>
        {options.map((option) => (
          <FilterChip
            key={option}
            active={value === option}
            onClick={() => onChange(option)}
          >
            {optionLabel ? optionLabel(option) : option}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`pill border ${
        active
          ? "border-ink bg-ink text-cream"
          : "border-line bg-card text-stone hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

/** One line under the filters that says where the box stands in this mode. */
function BoxStatusLine({
  mode,
  picked,
  itemLimit,
}: {
  mode: CatalogMode;
  picked: number;
  itemLimit: number;
}) {
  if (mode === "guest") {
    return (
      <>
        Create a free account to start a box. You only pay when you choose a
        plan.
      </>
    );
  }

  if (mode === "preview") {
    if (picked === 0) {
      return <>Add what you love — we&apos;ll match you with a plan that fits.</>;
    }
    const tier = recommendTierFor(picked);
    const pieces = picked === 1 ? "piece" : "pieces";
    if (!tier) {
      return (
        <>
          {picked} {pieces} picked — that&apos;s as many as our biggest plan
          covers. Remove a piece to add another.
        </>
      );
    }
    return (
      <>
        {picked} {pieces} picked · fits the{" "}
        <span className="font-medium text-ink">{tier.name}</span> plan (
        {formatDollars(tier.priceMonthly)}/mo, up to {tier.items})
      </>
    );
  }

  return (
    <>
      {picked} of {itemLimit} items picked
      {picked >= itemLimit ? " — your box is full for this month." : ""}
    </>
  );
}
