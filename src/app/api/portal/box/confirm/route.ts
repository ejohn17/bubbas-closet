import { ok, toErrorResponse } from "@/lib/api";
import { DomainError, returnGraceDays } from "@/lib/db/base";
import { confirmBox } from "@/lib/db/picks";
import { requireEntitledUser } from "@/lib/portal";
import { sendPickConfirmation } from "@/lib/email";

/**
 * Confirms the box for this billing cycle: holds become a pending pick order,
 * units move to `out`, and the member gets a confirmation email. No checkout —
 * the membership already covers the rental.
 */
export async function POST() {
  try {
    const { user, entitlement } = await requireEntitledUser();
    const sub = entitlement.subscription;

    if (!sub || !entitlement.cycleKey) {
      throw new DomainError("no_subscription", "No active membership found.", 403);
    }

    const address = user.profile?.shippingAddress;
    if (!address?.line1) {
      throw new DomainError(
        "missing_address",
        "Add a shipping address in your account before confirming.",
      );
    }

    const pick = await confirmBox({
      uid: user.uid,
      email: user.email,
      cycleKey: entitlement.cycleKey,
      tierId: sub.tierId,
      itemLimit: entitlement.itemLimit,
      shippingAddress: address,
      dueAt: sub.currentPeriodEnd + returnGraceDays() * 24 * 60 * 60 * 1000,
    });

    await sendPickConfirmation(pick);

    return ok({ pick });
  } catch (err) {
    return toErrorResponse(err);
  }
}
