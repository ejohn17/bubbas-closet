import { ok, readJson, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { addToBox, getBox, removeFromBox } from "@/lib/db/holds";
import { requireEntitledUser } from "@/lib/portal";

/** The member's current box (live holds). */
export async function GET() {
  try {
    const { user, entitlement } = await requireEntitledUser();
    const box = await getBox(user.uid, entitlement.itemLimit);
    return ok({ box });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Add a piece — reserves a specific unit for RULES.holdTtlMinutes. */
export async function POST(request: Request) {
  try {
    const { user, entitlement } = await requireEntitledUser();
    const { productId, size } = await readJson<{
      productId: string;
      size: string;
    }>(request);

    if (!productId || !size) {
      throw new DomainError("missing_fields", "Choose a size first.");
    }

    const hold = await addToBox({
      uid: user.uid,
      productId,
      size,
      itemLimit: entitlement.itemLimit,
    });
    const box = await getBox(user.uid, entitlement.itemLimit);

    return ok({ hold, box });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Remove a piece and release the unit back to the catalogue. */
export async function DELETE(request: Request) {
  try {
    const { user, entitlement } = await requireEntitledUser();
    const holdId =
      new URL(request.url).searchParams.get("holdId") ??
      (await readJson<{ holdId: string }>(request)).holdId;

    if (!holdId) throw new DomainError("missing_hold", "Nothing to remove.");

    await removeFromBox(user.uid, holdId);
    const box = await getBox(user.uid, entitlement.itemLimit);

    return ok({ box });
  } catch (err) {
    return toErrorResponse(err);
  }
}
