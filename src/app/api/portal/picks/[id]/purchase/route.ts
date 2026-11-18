import { ok, readJson, requireApiUser, toErrorResponse } from "@/lib/api";
import { createPurchaseCheckout } from "@/lib/purchases";

/**
 * A member chooses pieces from a box to buy instead of returning, and gets a
 * Stripe Checkout URL to pay for them. Signed-in only rather than entitled,
 * like return tracking: a lapsed member can still buy what they have.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const { unitIds } = await readJson<{ unitIds: string[] }>(request);

    const url = await createPurchaseCheckout({
      user,
      pickId: id,
      unitIds: Array.isArray(unitIds)
        ? unitIds.filter((unitId) => typeof unitId === "string")
        : [],
    });

    return ok({ url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
