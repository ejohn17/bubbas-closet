"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PickStatus, UnitCondition } from "@/lib/types";
import { formatCad } from "@/lib/format";
import {
  CONDITION_ORDER,
  conditionAdminLabel,
  outboundShippingIsFree,
  RULES,
} from "@/lib/rules";

/** Reads a file as base64 (without the data-URL prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type OrderItem = {
  unitId: string;
  productTitle: string;
  size: string;
  sku?: string;
  returnedAt?: number | null;
  purchasedAt?: number | null;
};

/**
 * Fulfilment controls for one order: ship it (charging outbound postage except
 * on Premier), receive garments back (all or some), email the return label
 * from the shop's address, charge a late fee, and keep internal notes. Orders
 * placed by an admin account can also be reset once testing is done.
 */
export function OrderActions({
  pickId,
  status,
  items,
  carrier,
  trackingNumber,
  notes,
  feeCents,
  shippingCents,
  estimatedShippingCents,
  flatShippingCents = null,
  tierId,
  email,
  isTestAccount = false,
}: {
  pickId: string;
  status: PickStatus;
  items: OrderItem[];
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
  feeCents?: number;
  shippingCents?: number;
  estimatedShippingCents?: number;
  /** Set when the destination ships at a flat rate (Canada); no amount to type. */
  flatShippingCents?: number | null;
  tierId: string;
  email?: string | null;
  /** The order was placed by an admin account, so it can be reset. */
  isTestAccount?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [carrierValue, setCarrierValue] = useState(carrier ?? "");
  const [trackingValue, setTrackingValue] = useState(trackingNumber ?? "");
  const [shippingValue, setShippingValue] = useState(
    estimatedShippingCents && estimatedShippingCents > 0
      ? (estimatedShippingCents / 100).toFixed(2)
      : "",
  );
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [condition, setCondition] = useState<UnitCondition>("excellent");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeReason, setFeeReason] = useState("Late return fee");
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Pieces the member bought aren't coming back, so they're never received.
  const outstanding = items.filter(
    (item) => !item.returnedAt && !item.purchasedAt,
  );
  const shippingFree = outboundShippingIsFree(tierId);
  const flatShipping = shippingFree ? null : flatShippingCents;
  const shippingCentsParsed = Math.round(Number(shippingValue) * 100);
  const canChargeShipping =
    shippingFree ||
    flatShipping !== null ||
    (Number.isFinite(shippingCentsParsed) && shippingCentsParsed >= 50);

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

      if (action === "ship") {
        setNotice(
          body.emailed
            ? "Shipped and the confirmation email was sent."
            : (body.emailError ??
                "Shipped, but the confirmation email did not send."),
        );
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

  async function sendReturnLabel() {
    if (!labelFile) return;
    setPending("returnLabel");
    let contentBase64: string;
    try {
      contentBase64 = await fileToBase64(labelFile);
    } catch {
      setPending(null);
      setError("Couldn't read that file. Try choosing it again.");
      return;
    }
    const done = await act("returnLabel", {
      label: { filename: labelFile.name, contentBase64 },
    });
    if (done) {
      setLabelFile(null);
      if (labelInputRef.current) labelInputRef.current.value = "";
      setNotice(`Return label emailed to ${email}.`);
    }
  }

  async function resetTestOrder() {
    const confirmed = window.confirm(
      "Reset this test order? Every garment on it goes back in the closet, " +
        "including any that were bought, and the order is deleted. " +
        "This can't be undone.",
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);
    setPending("resetTest");

    try {
      const res = await fetch(`/api/admin/picks/${pickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetTest" }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not reset this order.");
        setPending(null);
        return;
      }

      // The order no longer exists, so leave its page rather than refresh it.
      const params = new URLSearchParams({
        reset: String(body.restored?.length ?? 0),
        skipped: String(body.leftAlone?.length ?? 0),
      });
      router.push(`/admin/orders?${params.toString()}`);
    } catch {
      setError("Network error. Please try again.");
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
            {shippingFree
              ? "Premier includes outbound shipping — the member will not be charged. Adding tracking emails them automatically."
              : flatShipping !== null
                ? `Shipping within Canada is a flat ${formatCad(flatShipping)}. Submit to charge their card, mark the box shipped, and send a confirmation.`
                : estimatedShippingCents
                ? `Estimate is ${formatCad(estimatedShippingCents)} based on destination and piece count. Enter the label cost in CAD, then submit — we'll charge their card, mark the box shipped, and send a confirmation.`
                : "Enter the label cost in CAD, then submit. We'll charge their card, mark the box shipped, and send a confirmation."}
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
            {shippingFree || flatShipping !== null ? null : (
              <div className="w-28">
                <label className="label" htmlFor="shipping-cost">
                  Shipping (CAD $)
                </label>
                <input
                  id="shipping-cost"
                  className="input"
                  inputMode="decimal"
                  value={shippingValue}
                  onChange={(e) => setShippingValue(e.target.value)}
                  placeholder="12.50"
                />
              </div>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={pending !== null || !canChargeShipping}
              onClick={() =>
                act("ship", {
                  carrier: carrierValue,
                  trackingNumber: trackingValue,
                  shippingCents: shippingFree
                    ? 0
                    : (flatShipping ?? shippingCentsParsed),
                })
              }
            >
              {pending === "ship"
                ? shippingFree
                  ? "Saving…"
                  : "Charging…"
                : shippingFree
                  ? "Mark shipped"
                  : flatShipping !== null
                    ? `Ship and charge ${formatCad(flatShipping)}`
                    : "Ship and charge"}
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
          <h2 className="font-semibold">Send a return label</h2>
          <p className="mt-1 text-sm text-stone">
            Attach the prepaid label and we&apos;ll email it to the member from
            the shop&apos;s address, with the pieces still out and the due date.
          </p>

          {email ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <label className="label" htmlFor="return-label-file">
                  Label (PDF, PNG, or JPG)
                </label>
                <input
                  id="return-label-file"
                  ref={labelInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="input"
                  onChange={(e) => setLabelFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={pending !== null || !labelFile}
                onClick={sendReturnLabel}
              >
                {pending === "returnLabel" ? "Sending…" : "Email return label"}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-red-700">
              This order has no member email on file.
            </p>
          )}
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
            Billed to the member&apos;s saved card through Stripe. Policy:
            late fee up to {formatCad(RULES.lateFeeCents)}/item once after{" "}
            {RULES.lateFeeAfterDays} days past due; replacement{" "}
            {formatCad(RULES.replacementFeeCents)}/item.
            {feeCents ? ` Fees so far: ${formatCad(feeCents)}.` : ""}
            {shippingCents
              ? ` Shipping charged: ${formatCad(shippingCents)}.`
              : ""}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-28">
              <label className="label" htmlFor="fee-amount">
                Amount (CAD $)
              </label>
              <input
                id="fee-amount"
                className="input"
                inputMode="decimal"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder={String(RULES.lateFeeCents / 100)}
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

      {isTestAccount ? (
        <section className="card border-dashed p-5">
          <h2 className="font-semibold">Reset test order</h2>
          <p className="mt-1 text-sm text-stone">
            This order was placed by an admin account. When you&apos;re done
            testing, reset it to put every garment back in the closet as it was
            before the box was confirmed, including pieces that were bought or
            already received back. The order is deleted, so the account can
            confirm a new box straight away.
          </p>
          <p className="mt-2 text-sm text-stone">
            Stripe charges on this order (shipping, fees, purchases) are not
            refunded. In test mode that doesn&apos;t matter; with a live card,
            refund them from the Stripe dashboard.
          </p>
          <button
            type="button"
            className="btn-danger mt-4"
            disabled={pending !== null}
            onClick={resetTestOrder}
          >
            {pending === "resetTest" ? "Resetting…" : "Reset test order"}
          </button>
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
