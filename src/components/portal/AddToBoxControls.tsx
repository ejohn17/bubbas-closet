"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { conditionLabel } from "@/lib/rules";
import type { CatalogSize } from "@/lib/catalog";

/**
 * Choose a size, then add. Size chips used to be the add action themselves,
 * which read as filters rather than a cart control.
 */
export function AddToBoxControls({
  productId,
  sizes,
  inBox,
  full,
  preferredSize,
}: {
  productId: string;
  sizes: CatalogSize[];
  inBox: boolean;
  full: boolean;
  preferredSize?: string;
}) {
  const router = useRouter();
  const initialSize = useMemo(() => {
    if (sizes.length === 1) return sizes[0].size;
    if (preferredSize && sizes.some((s) => s.size === preferredSize)) {
      return preferredSize;
    }
    return "";
  }, [preferredSize, sizes]);

  const [selected, setSelected] = useState(initialSize);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(inBox);

  const chosen = sizes.find((s) => s.size === selected);

  async function add() {
    if (!selected) {
      setError("Choose a size first.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/portal/box", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, size: selected }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not add that piece.");
        return;
      }
      setAdded(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (added) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-accent-dark">In your box</p>
        <Link href="/portal/box" className="btn-outline btn-sm">
          Review box
        </Link>
      </div>
    );
  }

  if (sizes.length === 0) {
    return (
      <p className="text-sm text-stone">All out on loan right now</p>
    );
  }

  return (
    <div>
      <p className="label">Size</p>
      <div className="flex flex-wrap gap-1.5">
        {sizes.map(({ size, count, condition }) => {
          const isSelected = size === selected;
          return (
            <button
              key={size}
              type="button"
              onClick={() => {
                setSelected(size);
                setError(null);
              }}
              aria-pressed={isSelected}
              title={`${count} available · ${conditionLabel(condition)}`}
              className={`btn-sm rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                isSelected
                  ? "border-ink bg-ink text-cream"
                  : "border-line bg-card text-ink hover:border-accent"
              }`}
            >
              {size}
            </button>
          );
        })}
      </div>
      {chosen ? (
        <p className="mt-2 text-xs text-stone">
          {chosen.count} available · {conditionLabel(chosen.condition)}
        </p>
      ) : (
        <p className="mt-2 text-xs text-stone">Pick a size to add this piece.</p>
      )}

      <button
        type="button"
        className="btn-primary mt-4 w-full sm:w-auto"
        onClick={add}
        disabled={pending || full || !selected}
      >
        {pending
          ? "Adding…"
          : full
            ? "Box is full"
            : selected
              ? `Add size ${selected} to box`
              : "Add to box"}
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
