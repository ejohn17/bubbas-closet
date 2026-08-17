import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { TierPicker, type TierOption } from "@/components/TierPicker";
import { BRAND, STEPS, TIERS } from "@/lib/config";
import { getSessionUser } from "@/lib/session";
import { getEntitlement } from "@/lib/db/subscriptions";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
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

  if (user && isFirebaseConfigured()) {
    const { entitled } = await getEntitlement(user.uid);
    if (entitled) redirect("/portal");
  }

  const tiers: TierOption[] = TIERS.map((tier) => ({
    ...tier,
    available: Boolean(priceIdForTier(tier.id)),
  }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Choose your membership
        </h1>
        <p className="mt-3 max-w-xl text-stone">
          Pick the plan that matches how often you like to switch things up. You
          can change plans later from your account.
        </p>

        {cancelled ? (
          <p className="mt-6 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-stone">
            Checkout was cancelled — nothing was charged. Pick a plan whenever
            you&apos;re ready.
          </p>
        ) : null}

        <div className="mt-10">
          <TierPicker tiers={tiers} signedIn={Boolean(user)} />
        </div>

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
