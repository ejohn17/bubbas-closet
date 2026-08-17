import { BRAND } from "@/lib/config";
import type { PickDoc } from "@/lib/types";
import { siteUrl } from "@/lib/stripe";

/**
 * Transactional email via Resend (no SDK dependency).
 *
 * Set RESEND_API_KEY + WAITLIST_FROM_EMAIL to enable; when unset every send is
 * a no-op so the app works end to end without an email provider. Marketing
 * campaigns go through Mailchimp instead (see lib/mailchimp.ts); Stripe sends
 * its own payment receipts.
 */

type SendInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail({ to, subject, text }: SendInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_FROM_EMAIL;
  if (!apiKey || !from || !to) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    return res.ok;
  } catch {
    // Never fail an operation because an email had a hiccup.
    return false;
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

export async function sendPickConfirmation(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  await sendEmail({
    to: pick.email,
    subject: `Your ${BRAND.name} box is confirmed`,
    text:
      `Your box is confirmed and we're getting it ready to ship.\n\n` +
      `${pick.items.length} ${pick.items.length === 1 ? "piece" : "pieces"}:\n` +
      `${itemLines(pick)}\n\n` +
      `Please send everything back by ${formatDate(pick.dueAt)} using the prepaid label.\n\n` +
      `Track your box: ${siteUrl()}/portal/box\n\n— The ${BRAND.name} team`,
  });
}

export async function sendReturnReminder(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  const outstanding = pick.items.filter((i) => !i.returnedAt);
  await sendEmail({
    to: pick.email,
    subject: `Time to send your ${BRAND.name} pieces back`,
    text:
      `A friendly reminder that your rental period ends ${formatDate(pick.dueAt)}.\n\n` +
      `Still out with you:\n` +
      `${outstanding.map((i) => `  • ${i.productTitle} (size ${i.size})`).join("\n")}\n\n` +
      `Pop them in the prepaid mailer and drop it off — then pick your next set.\n\n` +
      `${siteUrl()}/portal\n\n— The ${BRAND.name} team`,
  });
}

export async function sendOverdueNotice(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  const outstanding = pick.items.filter((i) => !i.returnedAt);
  await sendEmail({
    to: pick.email,
    subject: `We're still waiting on your ${BRAND.name} pieces`,
    text:
      `Your return was due ${formatDate(pick.dueAt)} and these pieces haven't reached us yet:\n\n` +
      `${outstanding.map((i) => `  • ${i.productTitle} (size ${i.size})`).join("\n")}\n\n` +
      `Sending them back in the next few days avoids a late fee. If something's ` +
      `gone missing, just reply to this email and we'll sort it out.\n\n` +
      `— The ${BRAND.name} team`,
  });
}

export async function sendShippedNotice(pick: PickDoc): Promise<void> {
  if (!pick.email) return;
  const tracking = pick.trackingNumber
    ? `Tracking (${pick.carrier ?? "carrier"}): ${pick.trackingNumber}\n\n`
    : "";
  await sendEmail({
    to: pick.email,
    subject: `Your ${BRAND.name} box is on its way`,
    text:
      `Good news — your box has shipped.\n\n${tracking}` +
      `${pick.items.length} ${pick.items.length === 1 ? "piece" : "pieces"}:\n` +
      `${itemLines(pick)}\n\n— The ${BRAND.name} team`,
  });
}
