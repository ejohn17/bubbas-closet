import { ok, toErrorResponse } from "@/lib/api";
import { resolveBoxCycle } from "@/lib/box-cycle";
import { DomainError } from "@/lib/db/base";
import { confirmBox, listPicks } from "@/lib/db/picks";
import { requireEntitledUser } from "@/lib/portal";
import { sendPickConfirmation } from "@/lib/email";
import { isCountryAllowedForTier, unsupportedCountryMessage } from "@/lib/rules";
import { itemLimitFor } from "@/lib/tiers";

/**
 * Confirms the member's open box: holds become a pending pick order, units move
 * to `out`, and the member gets a confirmation email. That's this billing
 * cycle's box, or the next cycle's once the last one is on its way back. No
 * checkout — the membership already covers the rental.
 */
export async function POST() {
  try {
    const { user, entitlement } = await requireEntitledUser();
    const sub = entitlement.subscription;

    if (!sub || !entitlement.cycleKey) {
      throw new DomainError("no_subscription", "No active membership found.", 403);
    }

    const cycle = resolveBoxCycle(sub, await listPicks({ uid: user.uid }));
    if (!cycle.open) {
      throw new DomainError(
        "box_locked",
        `${cycle.notice.title} ${cycle.notice.detail}`,
      );
    }

    const address = user.profile?.shippingAddress;
    if (!address?.line1) {
      throw new DomainError(
        "missing_address",
        "Add a shipping address in your account before confirming.",
      );
    }
    if (!isCountryAllowedForTier(address.country, cycle.tierId)) {
      throw new DomainError(
        "unsupported_country",
        `${unsupportedCountryMessage(cycle.tierId)} Update your address in your account before confirming.`,
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
      cycleKey: cycle.cycleKey,
      tierId: cycle.tierId,
      itemLimit:
        cycle.tierId === sub.tierId
          ? entitlement.itemLimit
          : itemLimitFor(cycle.tierId),
      shippingAddress: address,
      dueAt: cycle.dueAt,
    });

    await sendPickConfirmation(pick);

    return ok({ pick });
  } catch (err) {
    return toErrorResponse(err);
  }
}
