import { formatMoney } from "@/lib/format";
import type { OutboundShippingKind } from "@/lib/rules";

/**
 * Shopify-style shipping line for a confirmed order: an estimate until the
 * label is billed, then the charged amount (or Included on Premier).
 */
export function ShippingCostLine({
  kind,
  cents,
  audience,
  compact = false,
}: {
  kind: OutboundShippingKind;
  cents: number;
  audience: "member" | "admin";
  compact?: boolean;
}) {
  const title = kind === "estimated" ? "Estimated shipping" : "Shipping";
  const amount =
    kind === "included"
      ? "Included"
      : kind === "estimated"
        ? `Est. ${formatMoney(cents)}`
        : formatMoney(cents);
  const hint =
    kind === "included"
      ? audience === "member"
        ? "Outbound shipping is included on your plan. Return labels are on us."
        : "Premier — the member is not billed for outbound postage."
      : kind === "estimated"
        ? audience === "member"
          ? "You'll be charged the actual label cost when this box ships. Return labels are on us."
          : "Based on destination and piece count. Enter the real label cost when you ship."
        : audience === "member"
          ? "Charged to the card on file. Return labels are on us."
          : "Billed to the member's card.";

  if (compact) {
    return (
      <p className="text-sm text-stone">
        {title}: <span className="text-ink">{amount}</span>
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm tabular-nums">{amount}</p>
      </div>
      <p className="mt-1 text-xs text-stone">{hint}</p>
    </div>
  );
}
