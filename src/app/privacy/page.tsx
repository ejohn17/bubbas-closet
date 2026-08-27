import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BRAND } from "@/lib/config";

/**
 * Draft privacy policy. It describes the processors this app actually uses
 * (Firebase, Stripe, Resend, Mailchimp) — keep it in step with the stack, and
 * get it reviewed alongside the rental terms before launch.
 */

export const metadata: Metadata = {
  title: `Privacy policy — ${BRAND.name}`,
  description: `How ${BRAND.name} collects, uses, and protects your information.`,
};

const LAST_UPDATED = "August 26, 2026";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy policy
        </h1>
        <p className="mt-2 text-sm text-stone">Last updated {LAST_UPDATED}</p>

        <div className="legal mt-8">
          <p>
            {BRAND.name} collects the least we can get away with: enough to send
            you clothes, take payment, and answer your email. We don&apos;t sell
            your information, and we don&apos;t run advertising trackers on this
            site.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account details</strong> — your email address and, if you
              sign in with Google, the name and profile photo Google shares with
              us.
            </li>
            <li>
              <strong>Sizing and shipping details</strong> — the sizes you
              enter, any notes you leave us, and the address we ship to.
            </li>
            <li>
              <strong>Rental history</strong> — the garments you&apos;ve rented,
              when they shipped, when they came back, and any fees charged.
            </li>
            <li>
              <strong>Payment details</strong> — handled entirely by Stripe. We
              store a Stripe customer reference and your subscription status; we
              never receive your full card number.
            </li>
            <li>
              <strong>Waitlist signups</strong> — an email address and the date
              you joined, if you signed up before launch.
            </li>
          </ul>
          <p>
            We don&apos;t ask for your child&apos;s name or date of birth, and
            you shouldn&apos;t include information about your children beyond
            the sizes needed to pick clothes that fit.
          </p>

          <h2>How we use it</h2>
          <ul>
            <li>
              To run your membership: picks, shipments, returns, and fees.
            </li>
            <li>
              To email you about your account — order confirmations, return
              reminders, and overdue notices. These aren&apos;t optional while
              you have an active membership.
            </li>
            <li>
              To send marketing email, only if you asked for it. Every marketing
              email has an unsubscribe link.
            </li>
            <li>
              To answer your questions and resolve problems with an order.
            </li>
            <li>To meet our tax and accounting obligations.</li>
          </ul>

          <h2>Who we share it with</h2>
          <p>
            Only the service providers we need to operate, each handling data on
            our behalf:
          </p>
          <ul>
            <li>
              <strong>Google Firebase</strong> — hosting, sign-in, and the
              database where your account and rental records live.
            </li>
            <li>
              <strong>Stripe</strong> — payments, subscriptions, and payment
              receipts.
            </li>
            <li>
              <strong>Resend</strong> — automated account emails.
            </li>
            <li>
              <strong>Mailchimp</strong> — marketing email, if you opted in.
            </li>
            <li>
              <strong>Shipping carriers</strong> — your name and address, to
              deliver and collect boxes.
            </li>
          </ul>
          <p>
            We&apos;ll also disclose information if the law requires it. We
            don&apos;t sell or rent your personal information to anyone.
          </p>

          <h2>Cookies</h2>
          <p>
            We set one cookie: a session cookie that keeps you signed in. It
            isn&apos;t used for advertising or cross-site tracking, and clearing
            it simply signs you out.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Account and rental records stay while your membership is active and
            for as long afterwards as we need them for tax and accounting
            purposes. Waitlist emails are kept until you unsubscribe or ask us
            to remove them.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>
              Update your email, sizes, or address any time from your account
              page.
            </li>
            <li>
              Unsubscribe from marketing email using the link in any of those
              emails.
            </li>
            <li>
              Ask us for a copy of your information, or ask us to correct or
              delete it, by emailing{" "}
              <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
              We may need to keep records tied to completed rentals and
              payments.
            </li>
          </ul>

          <h2>Children</h2>
          <p>
            This service is for adults renting on behalf of their children.
            Accounts are not intended for anyone under 18, and we don&apos;t
            knowingly collect information directly from children.
          </p>

          <h2>Security</h2>
          <p>
            Traffic to this site is encrypted, member data is only reachable
            through our own authenticated server, and payment details stay with
            Stripe. No system is perfect, but we&apos;ll tell you promptly if
            anything affecting your information goes wrong.
          </p>

          <h2>Changes</h2>
          <p>
            We&apos;ll post updates here and change the date at the top. Our{" "}
            <Link href="/terms">rental terms</Link> cover memberships, returns,
            and fees.
          </p>

          <h2>Contact</h2>
          <p>
            Email{" "}
            <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>{" "}
            with any privacy question and we&apos;ll get back to you.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
