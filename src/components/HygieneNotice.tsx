/** How every piece is cleaned and inspected between rentals. */
export const HygieneNotice = () => {
  return (
    <section className="border-t border-line">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Clean you can see, and trust.
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-line bg-card p-6">
            <h3 className="font-semibold">Gentle, green cleaning</h3>
            <p className="mt-2 text-sm text-stone">
              Between each rental, every piece is washed with 100% Perc-free,
              biodegradable, green-only solvents that are safer for your family
              &amp; the environment.
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-card p-6">
            <h3 className="font-semibold">Inspected by hand</h3>
            <p className="mt-2 text-sm text-stone">
              Every piece is inspected by our personal team after each wash.
            </p>
          </div>
          <div className="rounded-3xl border border-line bg-card p-6">
            <h3 className="font-semibold">Our own-kids standard</h3>
            <p className="mt-2 text-sm text-stone">
              Nothing goes out the door unless we&apos;d put it on our own kids.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
