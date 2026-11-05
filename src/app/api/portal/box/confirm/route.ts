import { ok, toErrorResponse } from "@/lib/api";
import { DomainError } from "@/lib/db/base";
import { confirmBox } from "@/lib/db/picks";
import { inReturnWindow, returnDueAtFor } from "@/lib/db/subscriptions";
import { requireEntitledUser } from "@/lib/portal";
import { sendPickConfirmation } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { isCountryAllowedForTier, unsupportedCountryMessage } from "@/lib/rules";

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
    if (inReturnWindow(sub)) {
      throw new DomainError(
        "return_window",
        `This cycle's rental period has ended. Your next box opens on ${formatDate(sub.currentPeriodEnd)}.`,
      );
    }

    const address = user.profile?.shippingAddress;
    if (!address?.line1) {
      throw new DomainError(
        "missing_address",
        "Add a shipping address in your account before confirming.",
      );
    }
    if (!isCountryAllowedForTier(address.country, sub.tierId)) {
      throw new DomainError(
        "unsupported_country",
        `${unsupportedCountryMessage(sub.tierId)} Update your address in your account before confirming.`,
      );
    }
    if (!address.phone?.trim()) {
      throw new DomainError(
        "missing_phone",
        "Add a phone number to your shipping address in your account before confirming.",
      );
    }

    const pick = await confirmBox({
      uid: user.uid,
      email: user.email,
      cycleKey: entitlement.cycleKey,
      tierId: sub.tierId,
      itemLimit: entitlement.itemLimit,
      shippingAddress: address,
      dueAt: returnDueAtFor(sub),
    });

    await sendPickConfirmation(pick);

    return ok({ pick });
  } catch (err) {
    return toErrorResponse(err);
  }
}
