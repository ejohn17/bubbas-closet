/** "Life happens" promise: normal wear and messes are never charged for. */
export const MessForgivenessNotice = () => {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="rounded-3xl border-2 border-accent bg-card p-6 sm:p-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Life happens. We&apos;ve got you!{" "}
          <span aria-hidden="true">🤎</span>
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-ink">
          Spills, stains, and everyday wear are all part of growing up! Normal
          wear and accidental messes are covered, with no damage fees. Because
          little ones are messy, and we get it!
        </p>
        <p className="mt-4 max-w-3xl text-sm text-stone">
          Retired garments are donated to charities and families in need.
          Items not returned or damaged beyond reuse may incur a fee of up to
          $5 per garment to help provide replacement funds/clothing to those in
          need.
        </p>
      </div>
    </section>
  );
};
