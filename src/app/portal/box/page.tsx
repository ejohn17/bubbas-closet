import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { listHolds } from "@/lib/db/holds";
import { findPickForCycle } from "@/lib/db/picks";
import { BoxSummary } from "@/components/portal/BoxSummary";

export const metadata = { title: "My box" };

export default async function BoxPage() {
  const user = await requireUser("/portal/box");
  const entitlement = await getEntitlement(user.uid);
  const holds = await listHolds(user.uid);

  const cyclePick = entitlement.cycleKey
    ? await findPickForCycle(user.uid, entitlement.cycleKey)
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">My box</h1>
      <p className="mt-2 mb-8 text-stone">
        Everything here is reserved for you. Confirm when you&apos;re happy with
        your picks and we&apos;ll get it shipped.
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
            image: h.image,
            expiresAt: h.expiresAt,
          }))}
          itemLimit={entitlement.itemLimit}
          hasAddress={Boolean(user.profile?.shippingAddress?.line1)}
        />
      )}
    </div>
  );
}
