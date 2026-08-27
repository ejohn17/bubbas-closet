import type { UnitCondition } from "@/lib/types";

/**
 * Business rules for the rental cycle, in one place.
 *
 * These were environment variables; they're constants now because they're
 * product decisions rather than deployment settings, and having them in two
 * places let the code and the wiki drift apart. Changing one is a code edit and
 * a deploy, which is the right friction for a rule that affects members mid-cycle.
 *
 * Item limits per tier live alongside pricing in config.ts.
 * See wiki/decisions.md § C.
 */
export const RULES = {
  /** How long a garment stays reserved while a member builds their box (C.1). */
  holdTtlMinutes: 45,

  /** Days after the cycle ends before a return counts as overdue (C.4). */
  returnGraceDays: 3,

  /** Days before the due date that a return reminder goes out. */
  reminderDaysBefore: 3,

  /** Currency for subscriptions and one-off fees. */
  currency: "usd",

  /**
   * Conditions a member can rent. Anything outside this list is withheld from
   * the catalogue, and a garment that comes back in one of those conditions is
   * retired rather than cleaned and re-listed (C.6).
   */
  rentableConditions: ["new", "excellent", "good"] as UnitCondition[],
} as const;

/** Ordered best to worst, for picking the best available garment to advertise. */
export const CONDITION_ORDER: UnitCondition[] = [
  "new",
  "excellent",
  "good",
  "fair",
];

export function isRentableCondition(condition: UnitCondition): boolean {
  return RULES.rentableConditions.includes(condition);
}

/** Member-facing label, e.g. "Excellent condition". */
export function conditionLabel(condition: UnitCondition): string {
  const labels: Record<UnitCondition, string> = {
    new: "New with tags",
    excellent: "Excellent condition",
    good: "Good condition",
    fair: "Fair condition",
  };
  return labels[condition];
}

/** Short labels for admin controls, flagging the ones that retire a garment. */
export function conditionAdminLabel(condition: UnitCondition): string {
  const base: Record<UnitCondition, string> = {
    new: "New with tags",
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
  };
  return isRentableCondition(condition)
    ? base[condition]
    : `${base[condition]} — retires garment`;
}

/** Returns the better of two conditions. */
export function bestCondition(
  a: UnitCondition,
  b: UnitCondition,
): UnitCondition {
  return CONDITION_ORDER.indexOf(a) <= CONDITION_ORDER.indexOf(b) ? a : b;
}
