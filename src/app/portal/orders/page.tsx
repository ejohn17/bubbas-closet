import Link from "next/link";
import { requireUser } from "@/lib/session";
import { resolveBoxCycle } from "@/lib/box-cycle";
import {
  isFullyPurchased,
  isOverdue,
  listPicks,
  outstandingItems,
} from "@/lib/db/picks";
import { getPortalAccess } from "@/lib/portal";
import { completePurchaseReturn, purchasableItems } from "@/lib/purchases";
import { ProductImage } from "@/components/ProductImage";
import { PurchaseItemsForm } from "@/components/portal/PurchaseItemsForm";
import { ReturnTrackingForm } from "@/components/portal/ReturnTrackingForm";
import { StatusPill } from "@/components/StatusPill";
import { formatCad, formatDate } from "@/lib/format";
import { outboundShippingSummary } from "@/lib/rules";
import { ShippingCostLine } from "@/components/ShippingCostLine";

export const metadata = { title: "My rentals" };

type Notice = { title: string; detail: string };

/**
 * Applies a purchase the member has just paid for and says what happened. The
 * Stripe webhook does the same work, so if this fails the purchase still lands
 * and the member is only asked to check back.
 */
async function settlePurchase(
  sessionId: string,
  uid: string,
): Promise<Notice | null> {
  try {
    const outcome = await completePurchaseReturn(sessionId, uid);
    if (!outcome) return null;

    const count = outcome.purchased.length;
    const refund =
      outcome.refundedCents > 0
        ? `${formatCad(outcome.refundedCents)} is on its way back to your card.`
        : "";

    if (count === 0) {
      return refund
        ? {
            title: "We couldn't complete that purchase.",
            detail: `Those pieces are no longer available to buy. ${refund}`,
          }
        : null;
    }
    return {
      title:
        count === 1 ? "That piece is yours." : `Those ${count} pieces are yours.`,
      detail: refund
        ? `There's nothing to send back for ${count === 1 ? "it" : "them"}. One piece you paid for was no longer available, so ${refund}`
        : `Thanks for your purchase. There's nothing to send back for ${count === 1 ? "it" : "them"}.`,
    };
  } catch (err) {
    console.error("[orders] could not confirm purchase", err);
    return {
      title: "We're confirming your payment.",
      detail: "Your purchase will show here shortly. Refresh the page in a moment.",
    };
  }
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; purchase?: string }>;
}) {
  const { confirmed, purchase } = await searchParams;
  const user = await requireUser("/portal/orders");

  // Before the boxes load, so the list below already shows the purchase.
  const purchaseNotice = purchase
    ? await settlePurchase(purchase, user.uid)
    : null;

  const [picks, { entitlement, mode }] = await Promise.all([
    listPicks({ uid: user.uid }),
    getPortalAccess(user),
  ]);
  const forSaleByPick = new Map(
    await Promise.all(
      picks.map(async (pick) => [pick.id, await purchasableItems(pick)] as const),
    ),
  );
  const cycle =
    mode === "member" && entitlement.subscription
      ? resolveBoxCycle(entitlement.subscription, picks)
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">My rentals</h1>
      <p className="mt-2 text-stone">
        Every box you&apos;ve picked, and what still needs to come back.
      </p>

      {confirmed ? (
        <p className="card mt-8 px-5 py-4 text-sm text-stone">
          <span className="font-medium text-ink">Box confirmed.</span> We&apos;re
          packing it now — you&apos;ll get an email when it ships.
        </p>
      ) : null}

      {purchaseNotice ? (
        <p role="status" className="card mt-8 px-5 py-4 text-sm text-stone">
          <span className="font-medium text-ink">{purchaseNotice.title}</span>{" "}
          {purchaseNotice.detail}
        </p>
      ) : null}

      {picks.length === 0 ? (
        <p className="mt-16 text-center text-stone">
          No rentals yet. Your first box will show up here.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {picks.map((pick, index) => {
            const outstanding = outstandingItems(pick).length;
            const forSale = forSaleByPick.get(pick.id) ?? [];
            const allPurchased = isFullyPurchased(pick);
            const late = isOverdue(pick);
            const shipping = outboundShippingSummary(pick);
            const out =
              pick.status === "shipped" ||
              pick.status === "partially_returned";
            const sentBack = out && Boolean(pick.returnShippedAt);

            return (
              <li key={pick.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {pick.items.length}{" "}
                      {pick.items.length === 1 ? "piece" : "pieces"} ·{" "}
                      {formatDate(pick.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-stone">
                      {pick.trackingNumber
                        ? `${pick.carrier ?? "Tracking"}: ${pick.trackingNumber}`
                        : pick.dueAt
                          ? `Return by ${formatDate(pick.dueAt)}`
                          : "Return details coming soon"}
                    </p>
                  </div>
                  {allPurchased ? (
                    <StatusPill status="sold" label="Purchased" />
                  ) : (
                    <StatusPill
                      status={
                        sentBack ? "sent_back" : late ? "overdue" : pick.status
                      }
                    />
                  )}
                </div>

                <ul className="mt-4 flex flex-wrap gap-3">
                  {pick.items.map((item) => (
                    <li
                      key={item.unitId}
                      className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2"
                    >
                      <ProductImage
                        src={item.image}
                        alt={item.productTitle}
                        className="h-12 w-10 rounded-lg"
                      />
                      <div className="text-sm">
                        <p className="font-medium">{item.productTitle}</p>
                        <p className="text-stone">
                          Size {item.size}
                          {item.purchasedAt
                            ? " · purchased"
                            : item.returnedAt
                              ? " · returned"
                              : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {pick.status !== "cancelled" ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <ShippingCostLine audience="member" {...shipping} />
                  </div>
                ) : null}

                {sentBack ? (
                  <p className="mt-4 text-sm text-stone">
                    Sent back {formatDate(pick.returnShippedAt)} · tracking{" "}
                    {pick.returnTrackingNumber}.
                    {index === 0 && cycle ? (
                      cycle.open ? (
                        <>
                          {" "}
                          <Link href="/portal" className="link text-ink">
                            Pick your next box
                          </Link>
                        </>
                      ) : (
                        ` ${cycle.notice.title}`
                      )
                    ) : null}
                  </p>
                ) : outstanding > 0 && pick.status !== "pending" ? (
                  <p className="mt-4 text-sm text-stone">
                    {outstanding} {outstanding === 1 ? "piece" : "pieces"} still
                    with you.
                  </p>
                ) : null}

                {out && forSale.length > 0 ? (
                  <PurchaseItemsForm
                    pickId={pick.id}
                    sentBack={sentBack}
                    items={forSale.map((item) => ({
                      unitId: item.unitId,
                      productTitle: item.productTitle,
                      size: item.size,
                      priceCents: item.priceCents,
                    }))}
                  />
                ) : null}

                {out && !sentBack ? (
                  <ReturnTrackingForm pickId={pick.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
