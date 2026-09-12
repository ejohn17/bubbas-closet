import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/validation";
import { addToWaitlist, markMailchimpSynced } from "@/lib/waitlist";
import { sendWaitlistConfirmation } from "@/lib/email";
import { subscribeToAudience } from "@/lib/mailchimp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const data = (payload ?? {}) as Record<string, unknown>;

  // Honeypot: bots fill hidden fields. Pretend success without storing.
  if (typeof data.company === "string" && data.company.trim() !== "") {
    return NextResponse.json({ ok: true, status: "added" });
  }

  const email = normalizeEmail(data.email);
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const consent = data.consent === true;
  if (!consent) {
    return NextResponse.json(
      { ok: false, error: "Please agree to receive launch updates." },
      { status: 400 },
    );
  }

  const source =
    typeof data.source === "string" && data.source.length <= 60
      ? data.source
      : "landing";

  const result = await addToWaitlist({ email, source, consent });

  if (result.status === "error") {
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }

  if (result.status === "added") {
    await sendWaitlistConfirmation(email);
    // Keeps the Mailchimp audience current for the launch campaign. No-op
    // until Mailchimp is configured; failures never block the signup.
    const sync = await subscribeToAudience(email);
    if (sync.status === "subscribed") {
      await markMailchimpSynced(email);
    }
  }

  return NextResponse.json({ ok: true, status: result.status });
}
