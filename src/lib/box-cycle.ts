import { nowMs } from "@/lib/db/base";
import {
  cycleKeyFor,
  inReturnWindow,
  returnDueAtFor,
} from "@/lib/db/subscriptions";
import { formatDate } from "@/lib/format";
import { RULES } from "@/lib/rules";
import type { PickDoc, SubscriptionDoc } from "@/lib/types";

export type BoxNotice = { title: string; detail: string };

/**
 * Whether a member can confirm a box right now, and what it would be filed
 * under. `tierId` is the plan the box falls under, which differs from the
 * member's current plan when an early box lands after a scheduled downgrade.
 */
export type BoxCycle =
  | {
      open: true;
      cycleKey: string;
      dueAt: number;
      tierId: string;
      notice: BoxNotice | null;
    }
  | { open: false; notice: BoxNotice };

/** Neither received by us nor reported as on its way back. */
function awaitingReturn(pick: PickDoc): boolean {
  return pick.status !== "returned" && !pick.returnShippedAt;
}

/**
 * One box per billing cycle. A member can use the current cycle's box until
 * the rental period ends. From then on, the next box opens as soon as nothing
 * is awaiting return. It's filed under the next cycle, so its rental days start
 * when that cycle is charged and the billing date never moves (C.4).
 *
 * Renewal itself still opens the box whatever is outstanding, because returns
 * don't block the billing-date pick (A.6). A membership set to cancel has no
 * next charge to cover an early box, so it never gets one.
 */
export function resolveBoxCycle(
  sub: SubscriptionDoc,
  picks: PickDoc[],
  at = nowMs(),
): BoxCycle {
  const live = picks.filter((pick) => pick.status !== "cancelled");
  const hasPick = (cycleKey: string) =>
    live.some((pick) => pick.cycleKey === cycleKey);

  const currentKey = cycleKeyFor(sub);
  const rentalOver = inReturnWindow(sub, at);
  if (!hasPick(currentKey) && !rentalOver) {
    return {
      open: true,
      cycleKey: currentKey,
      dueAt: returnDueAtFor(sub),
      tierId: sub.tierId,
      notice: null,
    };
  }

  const earliest = formatDate(returnDueAtFor(sub));
  const renewal = formatDate(sub.currentPeriodEnd);
  const rentalStarts = `Your ${RULES.rentalDays} days start on ${renewal}, when your membership renews.`;

  // Stripe's next period starts exactly where this one ends.
  const next = { ...sub, currentPeriodStart: sub.currentPeriodEnd };
  const nextKey = cycleKeyFor(next);

  if (hasPick(nextKey)) {
    return {
      open: false,
      notice: { title: "Your next box is confirmed.", detail: rentalStarts },
    };
  }
  if (sub.cancelAtPeriodEnd) {
    return {
      open: false,
      notice: {
        title: "Your membership is ending.",
        detail: `It ends on ${renewal}, so there's no next box to confirm.`,
      },
    };
  }
  if (live.some(awaitingReturn)) {
    return {
      open: false,
      notice: {
        title: rentalOver
          ? "Your next box unlocks once this one is on its way back."
          : `Your next box can unlock from ${earliest}.`,
        detail: `Add your return tracking under My rentals after you send this box back. Otherwise your next box opens on ${renewal}, when your membership renews.`,
      },
    };
  }
  if (!rentalOver) {
    return {
      open: false,
      notice: { title: `Your next box opens on ${earliest}.`, detail: rentalStarts },
    };
  }

  return {
    open: true,
    cycleKey: nextKey,
    dueAt: returnDueAtFor(next),
    tierId: sub.pendingTierId ?? sub.tierId,
    notice: { title: "Your next box is open.", detail: rentalStarts },
  };
}
