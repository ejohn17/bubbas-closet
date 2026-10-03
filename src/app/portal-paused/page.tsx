import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusPill } from "@/components/StatusPill";
import { ManageBillingButton } from "@/components/portal/ManageBillingButton";
import { getEntitlement } from "@/lib/db/subscriptions";
import { listPicks } from "@/lib/db/picks";
import { isBillingPaused } from "@/lib/portal";
import { requireUser } from "@/lib/session";
import { BRAND } from "@/lib/config";

export const metadata = { title: `Membership paused — ${BRAND.name}` };

export const dynamic = "force-dynamic";

/**
 * Members whose last payment failed land here instead of the closet: read-only,
 * with a route back to billing. Members whose membership simply ended go back
 * into the closet in preview mode and can rebuild a box before resubscribing.
 * Lives outside /portal so the gate can redirect here without looping.
 */
export default async function PortalPausedPage() {
  const user = await requireUser("/portal");
  const { subscription } = await getEntitlement(user.uid);

  if (!subscription || !isBillingPaused(subscription)) redirect("/portal");

  const picks = await listPicks({ uid: user.uid });
  const outstanding = picks
    .filter((p) => p.status === "shipped" || p.status === "partially_returned")
    .flatMap((p) => p.items.filter((item) => !item.returnedAt));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-6 pb-24 pt-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Your membership is paused
          </h1>
          <StatusPill status={subscription.status} />
        </div>

        <p className="mt-4 text-stone">
          We couldn&apos;t take the last payment, so the closet is locked for
          now. Update your card and everything comes straight back.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ManageBillingButton />
          <Link href="/subscribe" className="btn-primary">
            Choose a different plan
          </Link>
        </div>

        {outstanding.length > 0 ? (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-lg font-semibold">Still with you</h2>
            <p className="mt-1 text-sm text-stone">
              Send these back with the prepaid label we emailed you whenever you can.
            </p>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {outstanding.map((item) => (
                <li
                  key={item.unitId}
                  className="flex items-center justify-between rounded-2xl border border-line px-4 py-3"
                >
                  <span>{item.productTitle}</span>
                  <span className="text-stone">Size {item.size}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
