import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND, TIERS } from "@/lib/config";
import { RULES } from "@/lib/rules";

/**
 * Draft rental terms. Numbers come from config so the copy can't drift from
 * what the app enforces. Fee amounts marked [amount] and this whole document
 * need the client's sign-off and a lawyer's review before launch.
 */

export const metadata: Metadata = {
  title: `Rental terms — ${BRAND.name}`,
  description: `Membership, rental, return, and damage terms for ${BRAND.name}.`,
};

const LAST_UPDATED = "August 26, 2026";

export default function TermsPage() {
  const limits = TIERS.map((t) => `${t.name} (${t.items} items)`).join(", ");

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Rental terms
        </h1>
        <p className="mt-2 text-sm text-stone">Last updated {LAST_UPDATED}</p>

        <div className="legal mt-8">
          <p>
            These terms cover your membership and every garment you rent from{" "}
            {BRAND.name}. By subscribing you agree to them, so please read them
            — especially the sections on returns, late fees, and damage.
          </p>

          <h2>1. Your membership</h2>
          <p>
            Memberships are monthly and renew automatically until you cancel.
            Each tier includes a set number of garments per billing cycle:{" "}
            {limits}. Prices are shown at signup and exclude any sales tax,
            which is calculated at checkout.
          </p>
          <p>
            Billing is handled by Stripe. Your card is charged on the day you
            subscribe and on the same day each month after that. We never see or
            store your full card details.
          </p>

          <h2>2. Changing or cancelling</h2>
          <ul>
            <li>
              <strong>Upgrading</strong> takes effect immediately. Stripe
              prorates the difference and your higher item limit applies to the
              cycle you&apos;re in.
            </li>
            <li>
              <strong>Downgrading</strong> takes effect at your next renewal, so
              the cycle you already paid for keeps its limit.
            </li>
            <li>
              <strong>Cancelling</strong> can be done at any time from your
              account page. You keep access until the end of the cycle you paid
              for, and any garments you still have must come back by the return
              date.
            </li>
          </ul>
          <p>
            We don&apos;t offer refunds for partial months or for items you
            chose not to rent during a cycle.
          </p>

          <h2>3. Picking your garments</h2>
          <p>
            Your item limit resets each cycle. When you add a garment to your
            box we hold that specific piece for {RULES.holdTtlMinutes} minutes;
            if you haven&apos;t confirmed by then it goes back to the closet for
            someone else. Confirming your box is what sends it to us to pack.
          </p>
          <p>
            Availability changes constantly and we can&apos;t guarantee any
            particular garment, size, or style will be there when you look.
          </p>

          <h2>4. Condition of garments</h2>
          <p>
            Everything we send is pre-worn and cleaned between rentals. We grade
            each piece and only rent garments in{" "}
            {RULES.rentableConditions.join(", ")} condition — the grade for the
            exact piece you&apos;re getting is shown in your box before you
            confirm. Expect gentle signs of wear consistent with that grade.
            Anything below it is retired rather than re-rented.
          </p>

          <h2>5. Shipping</h2>
          <p>
            We ship within the United States only. Outbound shipping and a
            prepaid return label are included in your membership. You&apos;re
            responsible for keeping your shipping address current in your
            account; we aren&apos;t able to reroute a box once it&apos;s on its
            way.
          </p>

          <h2>6. Returns</h2>
          <p>
            Garments are due back by the end of your billing cycle. We allow a{" "}
            {RULES.returnGraceDays}-day grace period after that date, and the
            due date is shown on your order.
          </p>
          <p>
            Returning late doesn&apos;t block your next pick — you can choose
            new garments as soon as your cycle renews — but the outstanding
            items stay on your account until they arrive.
          </p>

          <h2>7. Late fees</h2>
          <p>
            Once the grace period passes, we may charge a late fee of [amount]
            per garment per week to the card on file. We&apos;ll email you
            before charging anything, and every fee appears on a Stripe receipt.
            If a garment is more than [number] days overdue, we may treat it as
            lost and charge the replacement fee below instead.
          </p>

          <h2>8. Care, damage, and loss</h2>
          <p>
            Normal wear is expected and never charged for: small pulls, a lost
            button, a faint mark that comes out in the wash. Please don&apos;t
            attempt repairs, alterations, or dyeing, and don&apos;t dry clean
            unless a garment&apos;s label requires it.
          </p>
          <p>
            If a garment comes back damaged beyond what we can clean or repair,
            or doesn&apos;t come back at all, we may charge a replacement fee of
            up to [amount or percentage of retail value] for that piece. We
            document the condition of every garment before it ships, and
            we&apos;ll share that record with you if a charge is ever in
            question.
          </p>

          <h2>9. How you may use the garments</h2>
          <p>
            Rentals are for personal use by the children in your household. You
            may not resell, rent out, lend commercially, or use garments for
            paid photography or other commercial purposes.
          </p>

          <h2>10. Hygiene and allergies</h2>
          <p>
            Every garment is laundered before it ships. That said, these are
            shared items that have been in other homes, and we can&apos;t
            guarantee an environment free of pet hair, fragrance, or common
            allergens. If your child has a serious allergy, rental clothing may
            not be right for you.
          </p>

          <h2>11. Suspending or ending a membership</h2>
          <p>
            We may pause or close an account for repeated late returns, damage
            or loss beyond normal wear, unpaid fees, or misuse of the garments.
            If we close your account, we&apos;ll tell you why and give you a
            date by which outstanding garments must be returned.
          </p>

          <h2>12. Changes to these terms</h2>
          <p>
            We&apos;ll post any changes on this page and update the date at the
            top. If a change materially affects your membership, we&apos;ll
            email you before it takes effect. Continuing to rent after that
            means you accept the updated terms.
          </p>

          <h2>13. Contact</h2>
          <p>
            Questions about anything here? Email{" "}
            <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>{" "}
            and a human will answer. Our{" "}
            <Link href="/privacy">privacy policy</Link> explains how we handle
            your information.
          </p>
        </div>
      </main>
    </>
  );
}
