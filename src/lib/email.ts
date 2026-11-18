import { BRAND } from "@/lib/config";
import { outstandingItems } from "@/lib/db/picks";
import type { PickDoc } from "@/lib/types";
import { siteUrl } from "@/lib/stripe";
import {
  flatOutboundShippingCents,
  outboundShippingIsFree,
  RULES,
} from "@/lib/rules";

/**
 * Transactional email via Resend (no SDK dependency).
 *
 * Set RESEND_API_KEY + WAITLIST_FROM_EMAIL to enable; when unset every send is
 * a no-op so the app works end to end without an email provider. Marketing
 * campaigns go through Mailchimp instead (see lib/mailchimp.ts); Stripe sends
 * its own payment receipts.
 */

/** A file attached to an email; `content` is base64. */
export type EmailAttachment = { filename: string; content: string };

type SendInput = {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
};

export type EmailResult = { sent: true } | { sent: false; reason: string };

export async function sendEmail({ to, subject, text }: SendInput): Promise<boolean> {
  return (await sendEmailResult({ to, subject, text })).sent;
}

async function sendEmailResult({
  to,
  subject,
  text,
  attachments,
}: SendInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      sent: false,
      reason: "Email isn't configured. Set RESEND_API_KEY and WAITLIST_FROM_EMAIL.",
    };
  }
  if (!to) {
    return { sent: false, reason: "This order has no member email." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, text, attachments }),
    });
    if (res.ok) return { sent: true };

    const detail = await res.text();
    console.error("[email] Resend rejected", res.status, detail);
    const lower = detail.toLowerCase();
    if (
      res.status === 403 ||
      lower.includes("not verified") ||
      lower.includes("domain")
    ) {
      const domain = from.match(/@([^>\s]+)/)?.[1] ?? "the sending domain";
      return {
        sent: false,
        reason: `Resend rejected the from-address. Verify ${domain} in Resend (SPF/DKIM), or use their onboarding address until then.`,
      };
    }
    return {
      sent: false,
      reason: "The email did not send. Check the server log for the Resend response.",
    };
  } catch (err) {
    console.error("[email] send failed", err);
    return { sent: false, reason: "The email did not send (network error)." };
  }
}

export async function sendWaitlistConfirmation(email: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: `You're on the ${BRAND.name} waitlist`,
    text:
      `Thanks for joining the ${BRAND.name} waitlist.\n\n` +
      `${BRAND.description}\n\n` +
      `We'll email you the moment memberships open. — The ${BRAND.name} team`,
  });
}

function itemLines(pick: PickDoc): string {
  return pick.items
    .map((item) => `  • ${item.productTitle} (size ${item.size})`)
    .join("\n");
}

function formatDate(ms: number | null | undefined): string {
  if (!ms) return "the end of your cycle";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function sendPickConfirmation(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  const estimate = pick.estimatedShippingCents ?? 0;
  const flat = flatOutboundShippingCents({
    tierId: pick.tierId,
    country: pick.shippingAddress?.country,
  });
  const shipping = outboundShippingIsFree(pick.tierId)
    ? "Outbound shipping is included on your plan.\n\n"
    : flat !== null
      ? `Shipping is a flat ${money(flat)} CAD, charged to your card when your box ships.\n\n`
      : estimate > 0
      ? `Estimated outbound shipping is ${money(estimate)} CAD. This is not the actual shipping cost — the real postage is calculated when your box ships and charged then.\n\n`
      : "Outbound shipping will be billed at the label cost when the box ships.\n\n";
  await sendEmail({
    to: pick.email,
    subject: `Your ${BRAND.name} box is confirmed`,
    text:
      `Your box is confirmed and we're getting it ready to ship.\n\n` +
      `${pick.items.length} ${pick.items.length === 1 ? "piece" : "pieces"}:\n` +
      `${itemLines(pick)}\n\n` +
      shipping +
      `We'll email a prepaid return label when it's time to send everything back ` +
      `(due ${formatDate(pick.dueAt)}).\n\n` +
      `Track your box: ${siteUrl()}/portal/orders\n\n— The ${BRAND.name} team`,
  });
}

export async function sendReturnReminder(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  const outstanding = outstandingItems(pick);
  await sendEmail({
    to: pick.email,
    subject: `Time to send your ${BRAND.name} pieces back`,
    text:
      `A friendly reminder that your rental period ends ${formatDate(pick.dueAt)}.\n\n` +
      `Still out with you:\n` +
      `${outstanding.map((i) => `  • ${i.productTitle} (size ${i.size})`).join("\n")}\n\n` +
      `Use the prepaid return label we emailed you, pop the pieces in the mailer, ` +
      `and drop it off. Then add the tracking number from your label under My ` +
      `rentals, and you can pick your next box from ${formatDate(pick.dueAt)}.\n\n` +
      `${siteUrl()}/portal/orders\n\n— The ${BRAND.name} team`,
  });
}

/**
 * Prepaid return label, sent from the shop's address (WAITLIST_FROM_EMAIL) with
 * the label the admin bought attached — never from the admin's own mailbox.
 */
export async function sendReturnLabel(input: {
  pick: PickDoc;
  to: string;
  name?: string | null;
  label: EmailAttachment;
}): Promise<EmailResult> {
  const { pick, label } = input;
  const outstanding = outstandingItems(pick);
  const name = input.name?.trim();
  const due = formatDate(pick.dueAt);
  return sendEmailResult({
    to: input.to,
    subject: `Time to send your ${BRAND.name} pieces back`,
    text:
      `${name ? `Hi ${name},` : "Hi,"}\n\n` +
      `It's time to return your ${BRAND.name} box. Please send these pieces ` +
      `back by ${due}:\n\n` +
      `${outstanding.map((i) => `  • ${i.productTitle} (size ${i.size})`).join("\n")}\n\n` +
      `We've attached a prepaid return label to this email. Print it, stick it ` +
      `on the package, and drop it off.\n\n` +
      `Once it's on its way, add the tracking number from the label under My ` +
      `rentals in your account. You can then pick your next box from ${due}, ` +
      `without waiting for your renewal.\n\n` +
      `${siteUrl()}/portal/orders\n\n— The ${BRAND.name} team`,
    attachments: [label],
  });
}

export async function sendOverdueNotice(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  const outstanding = outstandingItems(pick);
  await sendEmail({
    to: pick.email,
    subject: `We're still waiting on your ${BRAND.name} pieces`,
    text:
      `Your return was due ${formatDate(pick.dueAt)} and these pieces haven't reached us yet:\n\n` +
      `${outstanding.map((i) => `  • ${i.productTitle} (size ${i.size})`).join("\n")}\n\n` +
      `Sending them back within ${RULES.lateFeeAfterDays} days of the due date ` +
      `avoids a one-time late fee of up to $${RULES.lateFeeCents / 100} CAD per item. ` +
      `If something's gone missing, just reply to this email and we'll sort it out.\n\n` +
      `— The ${BRAND.name} team`,
  });
}

export async function sendShippedNotice(pick: PickDoc): Promise<EmailResult> {
  if (!pick.email) {
    return { sent: false, reason: "This order has no member email." };
  }
  const tracking = pick.trackingNumber
    ? `Tracking (${pick.carrier ?? "carrier"}): ${pick.trackingNumber}\n\n`
    : "";
  const shipping =
    pick.shippingCents && pick.shippingCents > 0
      ? `Outbound shipping of ${money(pick.shippingCents)} CAD ` +
        `was charged to the card on file. You'll get a separate Stripe receipt.\n\n`
      : "";
  return sendEmailResult({
    to: pick.email,
    subject: `Your ${BRAND.name} box is on its way`,
    text:
      `Good news — your box has shipped.\n\n${tracking}${shipping}` +
      `${pick.items.length} ${pick.items.length === 1 ? "piece" : "pieces"}:\n` +
      `${itemLines(pick)}\n\n` +
      `We'll email a prepaid return label when it's time to send everything back.\n\n` +
      `— The ${BRAND.name} team`,
  });
}
