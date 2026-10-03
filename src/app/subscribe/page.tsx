import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SizeRangeNotice } from "@/components/SizeRangeNotice";
import { TierPicker, type TierOption } from "@/components/TierPicker";
import { BRAND, recommendTierFor, STEPS, TIERS } from "@/lib/config";
import { formatDollars } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { listHolds, refreshHolds } from "@/lib/db/holds";
import { priceIdForTier } from "@/lib/tiers";

export const metadata: Metadata = {
  title: `Choose your membership — ${BRAND.name}`,
};

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { cancelled } = await searchParams;
  const user = await getSessionUser();

  let boxCount = 0;
  if (user && isFirebaseConfigured()) {
    const { entitled } = await getEntitlement(user.uid);
    if (entitled) redirect("/portal");
    await refreshHolds(user.uid);
    boxCount = (await listHolds(user.uid)).length;
  }

  const recommended = recommendTierFor(boxCount);
  const tiers: TierOption[] = TIERS.map((tier) => ({
    ...tier,
    available: Boolean(priceIdForTier(tier.id)),
  }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24 pt-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Choose your membership
        </h1>
        <p className="mt-3 max-w-xl text-stone">
          {boxCount > 0
            ? recommended
              ? `Your box has ${boxCount} ${boxCount === 1 ? "piece" : "pieces"}. ${recommended.name} (${formatDollars(recommended.priceMonthly)}/mo, up to ${recommended.items}) covers it — you can pick a larger plan if you want more room next month.`
              : `Your box has ${boxCount} pieces, which is as many as our biggest plan covers.`
            : "Browse the closet and build a box first if you like — or pick a plan now and choose pieces after you subscribe. You can change plans later from your account."}
        </p>
        <SizeRangeNotice className="mt-6 max-w-xl" />

        {cancelled ? (
          <p className="mt-6 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-stone">
            Checkout was cancelled — nothing was charged. Pick a plan whenever
            you&apos;re ready.
          </p>
        ) : null}

        {boxCount === 0 ? (
          <p className="mt-6 text-sm text-stone">
            Want to see what&apos;s on the shelf first?{" "}
            <Link href={user ? "/portal" : "/closet"} className="link text-ink">
              Browse the closet
            </Link>{" "}
            and come back when your box is ready.
          </p>
        ) : null}

        <div className="mt-10">
          <TierPicker
            tiers={tiers}
            signedIn={Boolean(user)}
            boxCount={boxCount}
            recommendedTierId={recommended?.id ?? null}
          />
        </div>

        <p className="mt-8 text-sm text-stone">
          Memberships renew monthly and you can cancel any time from your
          account. Returns, late fees, and damage are covered in our{" "}
          <Link href="/terms" className="link text-ink">
            rental terms
          </Link>
          .
        </p>

        <section className="mt-20 border-t border-line pt-12">
          <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-cream">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-stone">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
