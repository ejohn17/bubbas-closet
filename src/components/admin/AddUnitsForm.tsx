"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitCondition } from "@/lib/types";

const CONDITIONS: UnitCondition[] = ["new", "excellent", "good", "fair"];

/** Adds physical garments for one size of a style. */
export function AddUnitsForm({
  productId,
  suggestedSizes,
}: {
  productId: string;
  suggestedSizes: string[];
}) {
  const router = useRouter();
  const [size, setSize] = useState(suggestedSizes[0] ?? "");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<UnitCondition>("excellent");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const res = await fetch("/api/admin/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          size,
          quantity: Number(quantity),
          condition,
        }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not add inventory.");
        return;
      }

      setNotice(
        `Added ${body.count} ${body.count === 1 ? "garment" : "garments"} in size ${size}.`,
      );
      setQuantity("1");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="w-28">
        <label className="label" htmlFor="unit-size">
          Size
        </label>
        <input
          id="unit-size"
          className="input"
          required
          list="suggested-sizes"
          value={size}
          onChange={(e) => setSize(e.target.value)}
        />
        <datalist id="suggested-sizes">
          {suggestedSizes.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="w-24">
        <label className="label" htmlFor="unit-qty">
          Quantity
        </label>
        <input
          id="unit-qty"
          className="input"
          type="number"
          min={1}
          max={200}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="w-36">
        <label className="label" htmlFor="unit-condition">
          Condition
        </label>
        <select
          id="unit-condition"
          className="input"
          value={condition}
          onChange={(e) => setCondition(e.target.value as UnitCondition)}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn-primary" disabled={pending || !size}>
        {pending ? "Adding…" : "Add inventory"}
      </button>

      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="w-full text-sm text-accent-dark">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
