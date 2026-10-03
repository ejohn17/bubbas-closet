"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import { useHoldClock } from "@/components/portal/HoldBanner";
import { recommendTierFor } from "@/lib/config";
import { conditionLabel, estimateOutboundShippingCents, RULES } from "@/lib/rules";
import { formatDollars, formatMoney } from "@/lib/format";
import type { UnitCondition } from "@/lib/types";

export type BoxHold = {
  id: string;
  productTitle: string;
  size: string;
  condition?: UnitCondition;
  image?: string;
  expiresAt: number;
};

/**
 * The box: a list of held units with a shared countdown. For members,
 * confirming turns the holds into this cycle's rental order. For visitors
 * previewing before they subscribe, the same list leads to plan selection —
 * the plan is sized to what's in the box.
 */
export function BoxSummary({
  holds,
  itemLimit,
  hasAddress,
  addressHint,
  tierId,
  country,
  mode = "member",
}: {
  holds: BoxHold[];
  itemLimit: number;
  hasAddress: boolean;
  addressHint?: string | null;
  tierId?: string | null;
  country?: string | null;
  mode?: "member" | "preview";
}) {
  const router = useRouter();
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const previewing = mode === "preview";
  const items = holds.filter((item) => !removedIds.has(item.id));
  const recommended = previewing ? recommendTierFor(items.length) : null;
  const shipping = estimateOutboundShippingCents({
    tierId,
    country,
    itemCount: items.length,
  });

  const soonest = items.length
    ? Math.min(...items.map((i) => i.expiresAt))
    : null;
  const { expired, urgent, label } = useHoldClock(soonest);

  async function remove(holdId: string) {
    setError(null);
    setPending(holdId);
    try {
      const res = await fetch(
        `/api/portal/box?holdId=${encodeURIComponent(holdId)}`,
        {
          method: "DELETE",
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not remove that piece.");
        return;
      }
      setRemovedIds((prev) => new Set(prev).add(holdId));
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function confirm() {
    setError(null);
    setPending("confirm");
    try {
      const res = await fetch("/api/portal/box/confirm", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not confirm your box.");
        return;
      }
      router.push("/portal/orders?confirmed=1");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (!items.length) {
    return (
      <div className="card p-8 text-center">
        <p className="text-stone">Your box is empty.</p>
        <Link href="/portal" className="btn-primary mt-6">
          Browse the closet
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`mb-6 rounded-3xl border px-5 py-4 ${
          expired
            ? "border-red-200 bg-red-50 text-red-900"
            : urgent
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-line bg-card text-ink"
        }`}
      >
        {expired ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">
              Your reservation ran out. Refresh to rebuild your box — these
              pieces may already be back in the closet.
            </p>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => router.refresh()}
            >
              Refresh
            </button>
          </div>
        ) : (
          <>
            <p className="font-medium">
              {urgent ? "Hurry — your box is reserved for " : "Your box is reserved for "}
              <span className="tabular-nums">{label}</span>
            </p>
            <p className="mt-1 text-sm opacity-80">
              Adding another piece restarts the {RULES.holdTtlMinutes}-minute
              timer.{" "}
              {previewing
                ? "Choose a plan before these garments go back to the closet — the timer restarts when you head to checkout."
                : "Confirm before these garments go back to the closet."}
            </p>
          </>
        )}
      </div>

      <div className="card divide-y divide-line">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 p-4">
            <ProductImage
              src={item.image}
              alt={item.productTitle}
              className="h-20 w-16 shrink-0 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.productTitle}</p>
              <p className="text-sm text-stone">
                Size {item.size}
                {item.condition ? ` · ${conditionLabel(item.condition)}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => remove(item.id)}
              disabled={pending !== null}
            >
              {pending === item.id ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}
      </div>

      {previewing ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stone">
              {items.length} {items.length === 1 ? "piece" : "pieces"} picked
            </p>
            {recommended ? (
              <p className="mt-1 max-w-sm text-sm text-stone">
                Fits our{" "}
                <span className="font-medium text-ink">{recommended.name}</span>{" "}
                plan — {formatDollars(recommended.priceMonthly)}/month for up to{" "}
                {recommended.items} pieces. You can pick a bigger plan at
                checkout.
              </p>
            ) : (
              <p className="mt-1 max-w-sm text-sm text-stone">
                That&apos;s as many pieces as our biggest plan covers.
              </p>
            )}
          </div>

          {expired ? null : (
            <Link href="/subscribe" className="btn-primary">
              Choose a plan
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stone">
              {items.length} of {itemLimit} items
            </p>
            {hasAddress ? (
              shipping === 0 ? (
                <p className="mt-1 text-sm text-stone">
                  Outbound shipping included
                </p>
              ) : (
                <p className="mt-1 max-w-sm text-sm text-stone">
                  Estimated shipping {formatMoney(shipping)} — not the actual
                  cost. Real postage is calculated when your box ships.
                </p>
              )
            ) : null}
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={confirm}
            disabled={pending !== null || !hasAddress || expired}
          >
            {pending === "confirm" ? "Confirming…" : "Confirm my box"}
          </button>
        </div>
      )}

      {previewing ? (
        <p className="mt-4 text-sm text-stone">
          Nothing is charged until you choose a plan. Once you&apos;re a member,
          this box is ready to confirm.
        </p>
      ) : null}

      {!previewing && !hasAddress ? (
        <p className="mt-4 text-sm text-stone">
          {addressHint ?? "Add a shipping address"} in{" "}
          <Link href="/portal/account" className="link text-ink">
            your account
          </Link>{" "}
          before confirming.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
