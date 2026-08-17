import { ok, toErrorResponse } from "@/lib/api";
import { releaseExpiredHolds } from "@/lib/db/holds";
import { assertCronAuthorized } from "@/lib/cron";

/**
 * Returns garments whose 45-minute hold lapsed back to the closet.
 * Suggested schedule: every 5 minutes.
 */
export async function POST(request: Request) {
  try {
    await assertCronAuthorized(request);
    const released = await releaseExpiredHolds();
    return ok({ released });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export const GET = POST;
