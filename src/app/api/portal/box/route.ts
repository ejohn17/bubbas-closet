import { ok, readJson, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { addToBox, getBox, removeFromBox } from "@/lib/db/holds";
import { requirePortalUser } from "@/lib/portal";

/** The member's current box (live holds). */
export async function GET() {
  try {
    const { user, itemLimit } = await requirePortalUser();
    const box = await getBox(user.uid, itemLimit);
    return ok({ box });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Add a piece — reserves a specific unit for RULES.holdTtlMinutes.
 * Open to members and to signed-in visitors building a box before they
 * subscribe; the latter are capped at our largest plan.
 */
export async function POST(request: Request) {
  try {
    const { user, itemLimit, mode } = await requirePortalUser();
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
      itemLimit,
      limitMessage:
        mode === "preview"
          ? `That's as many pieces as our biggest plan covers (${itemLimit}). Remove something to add this.`
          : undefined,
    });
    const box = await getBox(user.uid, itemLimit);

    return ok({ hold, box });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Remove a piece and release the unit back to the catalogue. */
export async function DELETE(request: Request) {
  try {
    const { user, itemLimit } = await requirePortalUser();
    const holdId =
      new URL(request.url).searchParams.get("holdId") ??
      (await readJson<{ holdId: string }>(request)).holdId;

    if (!holdId) throw new DomainError("missing_hold", "Nothing to remove.");

    await removeFromBox(user.uid, holdId);
    const box = await getBox(user.uid, itemLimit);

    return ok({ box });
  } catch (err) {
    return toErrorResponse(err);
  }
}
