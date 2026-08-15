import { BRAND } from "@/lib/config";

/**
 * Optional transactional confirmation email via Resend (no SDK dependency).
 * Set RESEND_API_KEY + WAITLIST_FROM_EMAIL to enable. If unset, this is a
 * no-op so the waitlist still works without an email provider configured.
 *
 * Shopify Email/Messaging is intended for the launch/marketing blast later;
 * it cannot send this transactional confirmation from an external page.
 */
export async function sendWaitlistConfirmation(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_FROM_EMAIL;
  if (!apiKey || !from) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: `You're on the ${BRAND.name} waitlist`,
        text:
          `Thanks for joining the ${BRAND.name} waitlist.\n\n` +
          `${BRAND.description}\n\n` +
          `We'll email you the moment memberships open. — The ${BRAND.name} team`,
      }),
    });
  } catch {
    // Never fail the signup because the confirmation email had a hiccup.
  }
}
