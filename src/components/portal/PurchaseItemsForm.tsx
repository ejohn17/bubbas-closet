"use client";

import { useState } from "react";
import { formatCad } from "@/lib/format";

export type PurchaseOption = {
  unitId: string;
  productTitle: string;
  size: string;
  priceCents: number;
};

/**
 * Lets a member buy pieces from a box that's out with them instead of sending
 * them back. Choosing pieces and submitting hands off to Stripe Checkout; the
 * purchase is recorded once Stripe confirms the payment.
 */
export function PurchaseItemsForm({
  pickId,
  items,
  sentBack,
}: {
  pickId: string;
  items: PurchaseOption[];
  /** The member has already told us the rest of the box is on its way back. */
  sentBack: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = items
    .filter((item) => selected.has(item.unitId))
    .reduce((sum, item) => sum + item.priceCents, 0);

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch(`/api/portal/picks/${pickId}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitIds: [...selected] }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok || !body.url) {
        setError(body?.message ?? "Could not start checkout. Please try again.");
        setPending(false);
        return;
      }

      // Stay in the pending state while the browser leaves for Stripe.
      window.location.href = body.url as string;
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <details className="mt-4 border-t border-line pt-4">
      <summary className="text-sm font-medium">
        Want to keep something? Buy pieces from this box
      </summary>

      <form onSubmit={onSubmit} className="mt-3">
        <p className="text-sm text-stone">
          {sentBack
            ? "Held on to a piece you love? Buy it and it's yours."
            : "Buy any piece and it's yours. Just leave it out when you send the rest back."}{" "}
          You&apos;ll pay securely through Stripe.
        </p>

        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.unitId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(item.unitId)}
                  disabled={pending}
                  onChange={() => toggle(item.unitId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.productTitle}</span>
                  <span className="block text-stone">Size {item.size}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {formatCad(item.priceCents)}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <button
          type="submit"
          className="btn-primary mt-4"
          disabled={pending || selected.size === 0}
        >
          {pending
            ? "Opening checkout…"
            : selected.size === 0
              ? "Choose pieces to buy"
              : `Buy ${selected.size} ${selected.size === 1 ? "piece" : "pieces"} for ${formatCad(totalCents)}`}
        </button>

        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
