import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND, TIERS, STEPS } from "@/lib/config";

export default function Home() {
  return (
    <main className="flex flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:pt-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent-dark">
          Coming soon
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          {BRAND.tagline}.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-stone">{BRAND.description}</p>

        <div id="waitlist" className="mt-8 max-w-xl scroll-mt-24">
          <WaitlistForm source="hero" />
        </div>
      </section>

      {/* Tiers */}
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

      {/* How it works */}
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

      {/* Closing CTA */}
      <section className="border-t border-line bg-card/60">
        <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Be first in line
          </h2>
          <p className="mx-auto mt-2 max-w-md text-stone">
            Join the waitlist and we&apos;ll let you know the moment
            memberships open.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <WaitlistForm source="footer" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-stone">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-line pt-6 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
          <a href={`mailto:${BRAND.contactEmail}`} className="hover:text-ink">
            {BRAND.contactEmail}
          </a>
        </div>
      </footer>
    </main>
  );
}
