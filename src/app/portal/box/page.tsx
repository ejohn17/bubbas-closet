import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { listHolds } from "@/lib/db/holds";
import { findPickForCycle } from "@/lib/db/picks";
import { BoxSummary } from "@/components/portal/BoxSummary";
import { isCountryAllowedForTier, RULES } from "@/lib/rules";

export const metadata = { title: "My box" };

export default async function BoxPage() {
  const user = await requireUser("/portal/box");
  const entitlement = await getEntitlement(user.uid);
  const holds = await listHolds(user.uid);

  const cyclePick = entitlement.cycleKey
    ? await findPickForCycle(user.uid, entitlement.cycleKey)
    : null;

  const address = user.profile?.shippingAddress;
  const canShip = Boolean(
    address?.line1 &&
      isCountryAllowedForTier(address.country, entitlement.subscription?.tierId),
  );
  const addressHint = canShip
    ? null
    : address?.line1
      ? "Your current address isn't available on this plan. Update it"
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">My box</h1>
      <p className="mt-2 mb-8 text-stone">
        Everything here is reserved for {RULES.holdTtlMinutes} minutes. Confirm
        when you&apos;re happy with your picks and we&apos;ll get it shipped.
      </p>

      {cyclePick ? (
        <div className="card p-8 text-center">
          <p className="font-medium">
            This month&apos;s box is already confirmed.
          </p>
          <p className="mt-2 text-sm text-stone">
            Your next pick unlocks at the start of your new billing cycle.
          </p>
          <Link href="/portal/orders" className="btn-primary mt-6">
            View my rental
          </Link>
        </div>
      ) : (
        <BoxSummary
          holds={holds.map((h) => ({
            id: h.id,
            productTitle: h.productTitle,
            size: h.size,
            condition: h.condition,
            image: h.image,
            expiresAt: h.expiresAt,
          }))}
          itemLimit={entitlement.itemLimit}
          hasAddress={canShip}
          addressHint={addressHint}
        />
      )}
    </div>
  );
}
