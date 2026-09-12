import { ok, requireApiAdmin, toErrorResponse } from "@/lib/api";
import { syncWaitlistToAudience } from "@/lib/mailchimp";

/** Pushes stored waitlist emails into the Mailchimp audience. Safe to re-run. */
export async function POST() {
  try {
    await requireApiAdmin();
    const summary = await syncWaitlistToAudience();
    return ok({ summary });
  } catch (err) {
    return toErrorResponse(err);
  }
}
