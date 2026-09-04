import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND, TIERS, STEPS } from "@/lib/config";
import { getSessionUser } from "@/lib/session";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:pt-16">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          {BRAND.tagline}.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-stone">{BRAND.description}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {user ? (
            <Link href="/portal" className="btn-primary">
              Go to my closet
            </Link>
          ) : (
            <>
              <Link href="/subscribe" className="btn-primary">
                Become a member
              </Link>
              <Link href="/login" className="btn-outline">
                Sign in
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="border-y border-line bg-card/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Memberships
          </h2>
          <p className="mt-2 max-w-xl text-stone">
            Choose the monthly plan that matches how much you like to switch
            things up. More items, more variety.
          </p>
          <Link href="/subscribe" className="link mt-4 inline-block text-sm">
            Compare memberships
          </Link>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-3xl border p-8 ${
                  tier.featured
                    ? "border-accent bg-card shadow-sm"
                    : "border-line bg-card"
                }`}
              >
                {tier.featured ? (
                  <span className="absolute right-6 top-6 rounded-full bg-accent px-3 py-1 text-xs font-medium text-cream">
                    Most popular
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">
                    ${tier.priceMonthly}
                  </span>
                  <span className="text-stone">/ month</span>
                </div>
                <p className="mt-3 text-sm font-medium text-accent-dark">
                  {tier.items} items per month
                </p>
                <p className="mt-3 text-sm text-stone">{tier.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-medium text-cream">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-stone">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line bg-card/60">
        <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
          {user ? (
            <>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Your closet is waiting
              </h2>
              <p className="mx-auto mt-2 max-w-md text-stone">
                Pick this month&apos;s pieces, check what&apos;s out with you, or
                manage your membership.
              </p>
              <Link href="/portal" className="btn-primary mt-8">
                Go to my closet
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Ready for a rotating wardrobe?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-stone">
                Pick a plan, build your first box, and swap for something new
                next month.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/subscribe" className="btn-primary">
                  Become a member
                </Link>
                <Link href="/login" className="btn-outline">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
