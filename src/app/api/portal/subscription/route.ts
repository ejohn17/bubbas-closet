import { ok, readJson, requireApiUser, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { getPrimarySubscription } from "@/lib/db/subscriptions";
import { changeTier } from "@/lib/billing";

/** Tier change: upgrades apply immediately, downgrades at the next cycle. */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const { tierId } = await readJson<{ tierId: string }>(request);
    if (!tierId) throw new DomainError("missing_tier", "Choose a plan.");

    const sub = await getPrimarySubscription(user.uid);
    if (!sub) {
      throw new DomainError(
        "no_subscription",
        "You don't have a membership to change yet.",
      );
    }

    const result = await changeTier({
      uid: user.uid,
      subscriptionId: sub.id,
      toTierId: tierId,
    });

    return ok({
      applied: result.applied,
      message:
        result.applied === "immediate"
          ? "Your new plan is active now — the extra items are available right away."
          : "Your plan will change at the start of your next billing cycle.",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
