"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PickStatus, UnitCondition } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { CONDITION_ORDER, conditionAdminLabel } from "@/lib/rules";

export type OrderItem = {
  unitId: string;
  productTitle: string;
  size: string;
  sku?: string;
  returnedAt?: number | null;
};

/**
 * Fulfilment controls for one order: ship it, receive garments back (all or
 * some), charge a late fee, and keep internal notes.
 */
export function OrderActions({
  pickId,
  status,
  items,
  carrier,
  trackingNumber,
  notes,
  feeCents,
}: {
  pickId: string;
  status: PickStatus;
  items: OrderItem[];
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
  feeCents?: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [carrierValue, setCarrierValue] = useState(carrier ?? "");
  const [trackingValue, setTrackingValue] = useState(trackingNumber ?? "");
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [condition, setCondition] = useState<UnitCondition>("excellent");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeReason, setFeeReason] = useState("Late return fee");

  const outstanding = items.filter((item) => !item.returnedAt);

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setError(null);
    setNotice(null);
    setPending(action);

    try {
      const res = await fetch(`/api/admin/picks/${pickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "That didn't work.");
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setPending(null);
    }
  }

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {status === "pending" ? (
        <section className="card p-5">
          <h2 className="font-semibold">Ship this box</h2>
          <p className="mt-1 text-sm text-stone">
            Adding tracking emails the member automatically.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="label" htmlFor="carrier">
                Carrier
              </label>
              <input
                id="carrier"
                className="input"
                value={carrierValue}
                onChange={(e) => setCarrierValue(e.target.value)}
                placeholder="USPS"
              />
            </div>
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="tracking">
                Tracking number
              </label>
              <input
                id="tracking"
                className="input"
                value={trackingValue}
                onChange={(e) => setTrackingValue(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={pending !== null}
              onClick={() =>
                act("ship", {
                  carrier: carrierValue,
                  trackingNumber: trackingValue,
                })
              }
            >
              {pending === "ship" ? "Saving…" : "Mark shipped"}
            </button>
          </div>

          <button
            type="button"
            className="btn-danger btn-sm mt-5"
            disabled={pending !== null}
            onClick={() => act("cancel")}
          >
            {pending === "cancel" ? "Cancelling…" : "Cancel order"}
          </button>
        </section>
      ) : null}

      {outstanding.length > 0 &&
      status !== "pending" &&
      status !== "cancelled" ? (
        <section className="card p-5">
          <h2 className="font-semibold">Receive returns</h2>
          <p className="mt-1 text-sm text-stone">
            Returned garments move to cleaning, then back into the closet.
            Grading one below the rentable range retires it instead.
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {outstanding.map((item) => (
              <li key={item.unitId}>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(item.unitId)}
                    onChange={() => toggle(item.unitId)}
                  />
                  <span>
                    {item.productTitle}{" "}
                    <span className="text-stone">
                      size {item.size}
                      {item.sku ? ` · ${item.sku}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="w-52">
              <label className="label" htmlFor="return-condition">
                Condition back
              </label>
              <select
                id="return-condition"
                className="input"
                value={condition}
                onChange={(e) => setCondition(e.target.value as UnitCondition)}
              >
                {CONDITION_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {conditionAdminLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn-outline"
              disabled={pending !== null || selected.size === 0}
              onClick={async () => {
                const done = await act("return", {
                  unitIds: [...selected],
                  condition,
                });
                if (done) {
                  setSelected(new Set());
                  setNotice("Return recorded.");
                }
              }}
            >
              {pending === "return"
                ? "Saving…"
                : `Receive selected (${selected.size})`}
            </button>

            <button
              type="button"
              className="btn-primary"
              disabled={pending !== null}
              onClick={() => act("return", { condition })}
            >
              Receive everything
            </button>
          </div>
        </section>
      ) : null}

      {status !== "pending" && status !== "cancelled" ? (
        <section className="card p-5">
          <h2 className="font-semibold">Charge a fee</h2>
          <p className="mt-1 text-sm text-stone">
            Billed to the member&apos;s saved card through Stripe.
            {feeCents ? ` Charged so far: ${formatMoney(feeCents)}.` : ""}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-28">
              <label className="label" htmlFor="fee-amount">
                Amount ($)
              </label>
              <input
                id="fee-amount"
                className="input"
                inputMode="decimal"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="25"
              />
            </div>
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="fee-reason">
                Reason
              </label>
              <input
                id="fee-reason"
                className="input"
                value={feeReason}
                onChange={(e) => setFeeReason(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-outline"
              disabled={pending !== null || !Number(feeAmount)}
              onClick={async () => {
                const done = await act("fee", {
                  amountCents: Math.round(Number(feeAmount) * 100),
                  description: feeReason,
                });
                if (done) {
                  setFeeAmount("");
                  setNotice("Fee charged.");
                }
              }}
            >
              {pending === "fee" ? "Charging…" : "Charge fee"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="font-semibold">Internal notes</h2>
        <textarea
          className="input mt-3 min-h-24"
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
          placeholder="Anything the team should know about this order"
        />
        <button
          type="button"
          className="btn-outline mt-3"
          disabled={pending !== null}
          onClick={async () => {
            const done = await act("notes", { notes: notesValue });
            if (done) setNotice("Notes saved.");
          }}
        >
          {pending === "notes" ? "Saving…" : "Save notes"}
        </button>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-accent-dark">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
