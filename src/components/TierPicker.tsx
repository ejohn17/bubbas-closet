"use client";

import { useState } from "react";
import Link from "next/link";

export type TierOption = {
  id: string;
  name: string;
  priceMonthly: number;
  items: number;
  blurb: string;
  featured?: boolean;
  /** False when the tier has no Stripe price configured. */
  available: boolean;
};

/**
 * Membership selection. Signed-in visitors go straight to Stripe Checkout;
 * everyone else creates an account first and comes back here.
 */
export function TierPicker({
  tiers,
  signedIn,
  mode = "signup",
  currentTierId,
}: {
  tiers: TierOption[];
  signedIn: boolean;
  /** "signup" starts Checkout; "change" switches an existing membership. */
  mode?: "signup" | "change";
  currentTierId?: string | null;
}) {
  const [selected, setSelected] = useState<string>(
    tiers.find((t) => t.featured && t.available)?.id ??
      tiers.find((t) => t.available)?.id ??
      tiers[0]?.id ??
      "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onContinue() {
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const endpoint =
        mode === "change" ? "/api/portal/subscription" : "/api/stripe/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId: selected }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not continue. Please try again.");
        setPending(false);
        return;
      }

      if (body.url) {
        window.location.href = body.url as string;
        return;
      }

      setNotice((body.message as string) ?? "Your plan has been updated.");
      setPending(false);
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  const selectedTier = tiers.find((t) => t.id === selected);
  const disabled =
    pending ||
    !selectedTier?.available ||
    (mode === "change" && selected === currentTierId);

  return (
    <div>
      <div className="grid gap-5 md:grid-cols-3">
        {tiers.map((tier) => {
          const isSelected = tier.id === selected;
          const isCurrent = mode === "change" && tier.id === currentTierId;

          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => setSelected(tier.id)}
              aria-pressed={isSelected}
              className={`relative flex flex-col rounded-3xl border p-7 text-left transition ${
                isSelected
                  ? "border-accent bg-card shadow-sm"
                  : "border-line bg-card/70 hover:border-accent/60"
              }`}
            >
              {isCurrent ? (
                <span className="pill absolute right-5 top-5 bg-line text-stone">
                  Current plan
                </span>
              ) : tier.featured ? (
                <span className="pill absolute right-5 top-5 bg-accent text-cream">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">
                  ${tier.priceMonthly}
                </span>
                <span className="text-sm text-stone">/ month</span>
              </div>
              <p className="mt-2 text-sm font-medium text-accent-dark">
                {tier.items} items per month
              </p>
              <p className="mt-3 text-sm text-stone">{tier.blurb}</p>

              {!tier.available ? (
                <p className="mt-4 text-xs text-stone">
                  Not yet available for signup.
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-6 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-6 text-sm text-accent-dark">
          {notice}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {signedIn ? (
          <button
            type="button"
            className="btn-primary"
            onClick={onContinue}
            disabled={disabled}
          >
            {pending
              ? "One moment…"
              : mode === "change"
                ? "Switch plan"
                : "Continue to checkout"}
          </button>
        ) : (
          <Link className="btn-primary" href="/signup?next=%2Fsubscribe">
            Create an account to join
          </Link>
        )}

        <p className="text-sm text-stone">
          {mode === "change"
            ? "Upgrades start now; downgrades begin next cycle."
            : "Cancel anytime. Shipping is included both ways."}
        </p>
      </div>
    </div>
  );
}
