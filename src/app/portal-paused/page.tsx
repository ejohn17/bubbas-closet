import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusPill } from "@/components/StatusPill";
import { ManageBillingButton } from "@/components/portal/ManageBillingButton";
import { getEntitlement } from "@/lib/db/subscriptions";
import { listPicks } from "@/lib/db/picks";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { BRAND } from "@/lib/config";

export const metadata = { title: `Membership paused — ${BRAND.name}` };

export const dynamic = "force-dynamic";

/**
 * Lapsed members land here instead of the closet: read-only, with a route back
 * to an active membership. Lives outside /portal so the gate can redirect here
 * without looping.
 */
export default async function PortalPausedPage() {
  const user = await requireUser("/portal");
  const { subscription, entitled } = await getEntitlement(user.uid);

  if (entitled) redirect("/portal");
  if (!subscription) redirect("/subscribe");

  const picks = await listPicks({ uid: user.uid });
  const outstanding = picks
    .filter((p) => p.status === "shipped" || p.status === "partially_returned")
    .flatMap((p) => p.items.filter((item) => !item.returnedAt));

  const isPastDue =
    subscription.status === "past_due" || subscription.status === "unpaid";

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
          {isPastDue
            ? "We couldn't take the last payment, so the closet is locked for now. Update your card and everything comes straight back."
            : `Your membership ended ${formatDate(subscription.currentPeriodEnd)}. Pick a plan whenever you'd like to start again.`}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {isPastDue ? <ManageBillingButton /> : null}
          <Link href="/subscribe" className="btn-primary">
            {isPastDue ? "Choose a different plan" : "Restart my membership"}
          </Link>
        </div>

        {outstanding.length > 0 ? (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-lg font-semibold">Still with you</h2>
            <p className="mt-1 text-sm text-stone">
              Send these back with your prepaid label whenever you can.
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
