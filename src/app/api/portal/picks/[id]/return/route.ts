import { ok, readJson, requireApiUser, toErrorResponse } from "@/lib/api";
import { markSentBack } from "@/lib/db/picks";

/**
 * A member adds return tracking to a box they've sent back. Signed-in only
 * rather than entitled: a lapsed membership still has garments to return.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const { trackingNumber } = await readJson<{ trackingNumber: string }>(
      request,
    );

    await markSentBack(id, user.uid, trackingNumber);

    return ok();
  } catch (err) {
    return toErrorResponse(err);
  }
}
