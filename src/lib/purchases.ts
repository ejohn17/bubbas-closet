import type Stripe from "stripe";
import { DomainError } from "@/lib/db/base";
import {
  getPick,
  outstandingItems,
  recordPurchase,
  type PurchaseLine,
} from "@/lib/db/picks";
import { getProducts } from "@/lib/db/products";
import { ensureStripeCustomer } from "@/lib/billing";
import { isForSale, RULES } from "@/lib/rules";
import { requireStripe, siteUrl } from "@/lib/stripe";
import type { PickDoc, PickItem } from "@/lib/types";

/**
 * Buying rented garments outright.
 *
 * A member with a box out can pay to keep any piece whose style has a purchase
 * price. They pay through Stripe Checkout (a one-off payment, separate from
 * the membership), and once Stripe confirms it the piece is marked purchased
 * on the order and its unit is sold out of inventory.
 *
 * Stripe is the record of what was paid: each Checkout line carries the unit
 * id, so nothing about a purchase is stored until the money has arrived.
 */

/** Marks a Checkout session as a garment purchase, not a membership signup. */
const PURCHASE_KIND = "purchase";

/**
 * How long a purchase checkout stays payable. Stripe's minimum is 30 minutes;
 * the extra minute covers clock skew. Short on purpose, so an abandoned
 * checkout can't be paid days later for a garment that has since come back.
 */
const CHECKOUT_TTL_SECONDS = 31 * 60;

export function isPurchaseSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.kind === PURCHASE_KIND;
}

export type PurchasableItem = PickItem & { priceCents: number };

/**
 * Pieces from a box that the member can buy right now: still out with them,
 * and of a style admin has put a purchase price on.
 */
export async function purchasableItems(
  pick: PickDoc,
): Promise<PurchasableItem[]> {
  if (pick.status !== "shipped" && pick.status !== "partially_returned") {
    return [];
  }

  const items = outstandingItems(pick);
  const products = await getProducts([
    ...new Set(items.map((item) => item.productId)),
  ]);
  const priceByProduct = new Map(
    products
      .filter(isForSale)
      .map((product) => [product.id, product.purchasePriceCents]),
  );

  return items.flatMap((item) => {
    const priceCents = priceByProduct.get(item.productId);
    return priceCents ? [{ ...item, priceCents }] : [];
  });
}

/** Starts Stripe Checkout for the chosen pieces and returns its URL. */
export async function createPurchaseCheckout(input: {
  user: { uid: string; email: string | null; name?: string | null };
  pickId: string;
  unitIds: string[];
}): Promise<string> {
  const pick = await getPick(input.pickId);
  if (!pick || pick.uid !== input.user.uid) {
    throw new DomainError("pick_not_found", "Order not found.", 404);
  }
  if (pick.status !== "shipped" && pick.status !== "partially_returned") {
    throw new DomainError(
      "not_purchasable",
      "You can only buy pieces from a box that's out with you.",
    );
  }

  const wanted = new Set(input.unitIds);
  if (wanted.size === 0) {
    throw new DomainError("nothing_selected", "Choose at least one piece to buy.");
  }

  const items = (await purchasableItems(pick)).filter((item) =>
    wanted.has(item.unitId),
  );
  if (items.length !== wanted.size) {
    throw new DomainError(
      "item_unavailable",
      "One of those pieces can't be bought any more. Refresh the page and try again.",
      409,
    );
  }

  const stripe = requireStripe();
  const customerId = await ensureStripeCustomer(input.user);
  const metadata = {
    kind: PURCHASE_KIND,
    uid: input.user.uid,
    pickId: pick.id,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: input.user.uid,
    // Cards settle while the member is still on Stripe's page, so the session
    // is paid by the time it completes. Delayed methods would need their own
    // webhook events before a garment could be handed over.
    payment_method_types: ["card"],
    line_items: items.map((item) => ({
      quantity: 1,
      metadata: { unitId: item.unitId },
      price_data: {
        currency: RULES.currency,
        unit_amount: item.priceCents,
        product_data: {
          name: `${item.productTitle} (size ${item.size})`,
          ...(isPublicImage(item.image) ? { images: [item.image] } : {}),
        },
      },
    })),
    metadata,
    payment_intent_data: { description: "Garment purchase", metadata },
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
    success_url: `${siteUrl()}/portal/orders?purchase={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/portal/orders`,
  });

  if (!session.url) {
    throw new DomainError("checkout_failed", "Could not start checkout.", 502);
  }
  return session.url;
}

/** Stripe only accepts absolute, publicly reachable image URLs. */
function isPublicImage(url: string | undefined): url is string {
  return Boolean(url && url.startsWith("https://") && url.length <= 2048);
}

export type PurchaseOutcome = {
  /** Pieces this checkout bought. */
  purchased: PickItem[];
  /** Paid for but not handed over, so sent straight back to the card. */
  refundedCents: number;
};

type PaidLine = PurchaseLine & { paidCents: number };

/**
 * Applies a paid purchase checkout: marks each piece purchased and sells its
 * unit. Idempotent, so the webhook and the page the member returns to can both
 * call it. Returns null for a session that isn't a paid purchase.
 *
 * A piece that can no longer be handed over (it was received back while the
 * member was paying, or was paid for twice) is refunded rather than sold.
 */
export async function completePurchaseSession(
  session: Stripe.Checkout.Session,
): Promise<PurchaseOutcome | null> {
  const { pickId, uid } = session.metadata ?? {};
  if (!isPurchaseSession(session) || !pickId || !uid) return null;
  if (session.payment_status !== "paid") return null;

  const stripe = requireStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });

  const lines: PaidLine[] = [];
  let unmatchedCents = 0;
  for (const line of lineItems.data) {
    const unitId = line.metadata?.unitId;
    if (unitId) {
      lines.push({
        unitId,
        priceCents: line.amount_subtotal,
        paidCents: line.amount_total,
      });
    } else {
      unmatchedCents += line.amount_total;
    }
  }

  const { purchased, rejected } = await recordPurchase(pickId, {
    uid,
    sessionId: session.id,
    lines,
  });

  const refundedCents =
    unmatchedCents + rejected.reduce((sum, line) => sum + line.paidCents, 0);
  if (refundedCents > 0) {
    console.error(
      `[purchases] session ${session.id} paid for pieces that can't be sold; refunding ${refundedCents} cents`,
      rejected.map((line) => line.unitId),
    );
    await refundOnce(session, pickId, refundedCents);
  }

  return { purchased, refundedCents };
}

/**
 * Refunds the part of a purchase we couldn't honour. Checks for an earlier
 * refund first: this can run again long after Stripe has forgotten the
 * idempotency key, e.g. when the member reopens their confirmation link.
 */
async function refundOnce(
  session: Stripe.Checkout.Session,
  pickId: string,
  amountCents: number,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) {
    throw new Error(`Purchase session ${session.id} has no payment to refund.`);
  }

  const stripe = requireStripe();
  const earlier = await stripe.refunds.list({
    payment_intent: paymentIntentId,
    limit: 100,
  });
  if (
    earlier.data.some(
      (refund) => refund.metadata?.purchaseSessionId === session.id,
    )
  ) {
    return;
  }

  await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount: amountCents,
      metadata: { kind: PURCHASE_KIND, pickId, purchaseSessionId: session.id },
    },
    { idempotencyKey: `purchase-refund-${session.id}` },
  );
}

/**
 * Applies the purchase when the member lands back on the site, so they see it
 * without waiting on webhook delivery. Returns null unless the session is this
 * member's own paid purchase.
 */
export async function completePurchaseReturn(
  sessionId: string,
  uid: string,
): Promise<PurchaseOutcome | null> {
  const session = await requireStripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.uid !== uid) return null;
  return completePurchaseSession(session);
}
