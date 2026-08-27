"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import { conditionLabel } from "@/lib/rules";
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
 * The box: a list of held units with a shared countdown. Confirming turns the
 * holds into this cycle's rental order.
 */
export function BoxSummary({
  holds,
  itemLimit,
  hasAddress,
}: {
  holds: BoxHold[];
  itemLimit: number;
  hasAddress: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(holds);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const soonest = items.length
    ? Math.min(...items.map((i) => i.expiresAt))
    : null;
  const minutesLeft = soonest
    ? Math.max(0, Math.round((soonest - now) / 60_000))
    : null;

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
      setItems((prev) => prev.filter((i) => i.id !== holdId));
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-stone">
          {items.length} of {itemLimit} items
          {minutesLeft !== null ? (
            <>
              {" · "}
              {minutesLeft > 0
                ? `held for another ${minutesLeft} min`
                : "holds have expired — refresh to rebuild your box"}
            </>
          ) : null}
        </p>

        <button
          type="button"
          className="btn-primary"
          onClick={confirm}
          disabled={pending !== null || !hasAddress}
        >
          {pending === "confirm" ? "Confirming…" : "Confirm my box"}
        </button>
      </div>

      {!hasAddress ? (
        <p className="mt-4 text-sm text-stone">
          Add a shipping address in{" "}
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
