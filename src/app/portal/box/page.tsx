import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getPortalAccess } from "@/lib/portal";
import { resolveBoxCycle } from "@/lib/box-cycle";
import { nowMs } from "@/lib/db/base";
import { listHolds } from "@/lib/db/holds";
import { listPicks } from "@/lib/db/picks";
import { BoxSummary } from "@/components/portal/BoxSummary";
import { isCountryAllowedForTier, RULES } from "@/lib/rules";

export const metadata = { title: "My box" };

export default async function BoxPage() {
  const user = await requireUser("/portal/box");
  const access = await getPortalAccess(user);
  const { entitlement, mode, itemLimit } = access;
  const holds = await listHolds(user.uid);
  const previewing = mode === "preview";

  const subscription = entitlement.subscription;
  const cycle =
    mode === "member" && subscription
      ? resolveBoxCycle(subscription, await listPicks({ uid: user.uid }))
      : null;

  const address = user.profile?.shippingAddress;
  const countryAllowed = Boolean(
    address?.line1 &&
      isCountryAllowedForTier(address.country, entitlement.subscription?.tierId),
  );
  const canShip = countryAllowed && Boolean(address?.phone?.trim());
  const addressHint = canShip
    ? null
    : countryAllowed
      ? "Add a phone number to your shipping address"
      : address?.line1
        ? "Your current address isn't available on this plan. Update it"
        : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">My box</h1>
      <p className="mt-2 mb-8 text-stone">
        {previewing
          ? `Everything here is reserved for ${RULES.holdTtlMinutes} minutes. Choose a plan that covers these pieces — nothing is charged until you subscribe.`
          : `Everything here is reserved for ${RULES.holdTtlMinutes} minutes. Confirm when you're happy with your picks and we'll get it shipped.`}
      </p>

      {cycle && !cycle.open ? (
        <div className="card p-8 text-center">
          <p className="font-medium">{cycle.notice.title}</p>
          <p className="mt-2 text-sm text-stone">{cycle.notice.detail}</p>
          <Link href="/portal/orders" className="btn-primary mt-6">
            View my rentals
          </Link>
        </div>
      ) : (
        <>
          {cycle?.notice ? (
            <p className="card mb-6 px-5 py-4 text-sm text-stone">
              <span className="font-medium text-ink">{cycle.notice.title}</span>{" "}
              {cycle.notice.detail}
            </p>
          ) : null}
          <BoxSummary
            holds={holds.map((h) => ({
              id: h.id,
              productTitle: h.productTitle,
              size: h.size,
              condition: h.condition,
              image: h.image,
              expiresAt: h.expiresAt,
            }))}
            itemLimit={itemLimit}
            renderedAt={nowMs()}
            hasAddress={canShip}
            addressHint={addressHint}
            tierId={cycle?.tierId ?? entitlement.subscription?.tierId}
            country={address?.country}
            mode={previewing ? "preview" : "member"}
          />
        </>
      )}
    </div>
  );
}
