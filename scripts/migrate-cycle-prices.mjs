/**
 * Moves members from the legacy monthly prices to the 35-day prices at their
 * next renewal, without an extra charge.
 *
 *   node scripts/migrate-cycle-prices.mjs            # dry run: reports only
 *   node scripts/migrate-cycle-prices.mjs --apply    # makes the changes
 *
 * Reads `.env` (or the environment) for STRIPE_SECRET_KEY, the new prices in
 * STRIPE_PRICE_<TIER>, and the old ones in STRIPE_PRICE_<TIER>_LEGACY.
 *
 * Why a schedule rather than a price swap: Stripe resets the billing anchor and
 * invoices immediately whenever a subscription changes billing interval, so
 * swapping month → 35 days directly would charge members again. Instead each
 * subscription gets a schedule that keeps the old price until the current
 * period ends, then starts the 35-day price from that date. The member's next
 * charge is their normal renewal, at the same amount, and every one after it
 * is 35 days apart. The schedule releases itself after the first 35-day cycle.
 *
 * Safe to re-run: subscriptions already scheduled onto a new price are skipped.
 */
import { existsSync } from "node:fs";
import Stripe from "stripe";

/** Must match RULES.cycleDays in src/lib/rules.ts. */
const CYCLE_DAYS = 35;

const TIERS = [
  { id: "essential", env: "STRIPE_PRICE_ESSENTIAL" },
  { id: "signature", env: "STRIPE_PRICE_SIGNATURE" },
  { id: "premier", env: "STRIPE_PRICE_PREMIER" },
];

/** Members still billing; cancelled and never-paid subscriptions are left alone. */
const MIGRATE_STATUSES = ["active", "trialing", "past_due"];

if (existsSync(".env")) process.loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}

const stripe = new Stripe(key);
const now = Math.floor(Date.now() / 1000);

/** legacy price id → new price id */
const priceMap = await loadPriceMap();

const summary = { migrated: 0, skipped: 0, failed: 0 };
console.log(
  `${apply ? "APPLYING" : "DRY RUN"} against Stripe ${key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test"} mode\n`,
);

for (const [legacyPriceId, newPriceId] of priceMap) {
  for await (const sub of stripe.subscriptions.list({
    price: legacyPriceId,
    status: "all",
    expand: ["data.schedule"],
  })) {
    if (!MIGRATE_STATUSES.includes(sub.status)) continue;
    try {
      const result = await migrate(sub, newPriceId);
      summary[result.outcome] += 1;
      console.log(`${result.outcome.padEnd(8)} ${sub.id}  ${result.note}`);
    } catch (err) {
      summary.failed += 1;
      console.error(`failed   ${sub.id}  ${err instanceof Error ? err.message : err}`);
    }
  }
}

console.log(
  `\n${summary.migrated} ${apply ? "migrated" : "to migrate"}, ${summary.skipped} skipped, ${summary.failed} failed.`,
);
if (!apply && summary.migrated > 0) {
  console.log("Re-run with --apply to make these changes.");
}
process.exit(summary.failed > 0 ? 1 : 0);

/**
 * Checks every tier has a new 35-day price and a legacy price in the same
 * currency (Stripe won't change a subscription's currency).
 */
async function loadPriceMap() {
  const map = new Map();
  for (const tier of TIERS) {
    const newId = process.env[tier.env];
    const legacyId = process.env[`${tier.env}_LEGACY`];
    if (!legacyId) {
      console.log(`${tier.id}: no ${tier.env}_LEGACY set, nothing to migrate`);
      continue;
    }
    if (!newId || newId === legacyId) {
      throw new Error(`${tier.env} must be set to the new 35-day price for ${tier.id}.`);
    }

    const [legacy, next] = await Promise.all([
      stripe.prices.retrieve(legacyId),
      stripe.prices.retrieve(newId),
    ]);
    const r = next.recurring;
    if (r?.interval !== "day" || r.interval_count !== CYCLE_DAYS) {
      throw new Error(
        `${tier.env} (${newId}) recurs every ${r?.interval_count} ${r?.interval}; expected ${CYCLE_DAYS} day.`,
      );
    }
    if (legacy.currency !== next.currency) {
      throw new Error(
        `${tier.id}: legacy price is ${legacy.currency}, new price is ${next.currency}.`,
      );
    }
    if (legacy.unit_amount !== next.unit_amount) {
      console.warn(
        `${tier.id}: amount changes ${legacy.unit_amount} → ${next.unit_amount} ${next.currency} at renewal`,
      );
    }
    map.set(legacyId, newId);
  }
  return map;
}

async function migrate(sub, newPriceId) {
  if (sub.items.data.length !== 1) {
    return skip(`has ${sub.items.data.length} items; migrate by hand`);
  }
  if (sub.cancel_at_period_end || sub.cancel_at) {
    return skip("set to cancel; nothing to renew");
  }
  if (sub.discounts?.length || sub.discount) {
    // Rewriting phases can drop or restart a coupon, so leave these for a human.
    return skip("has a discount applied; migrate by hand in the dashboard");
  }

  const schedule = sub.schedule;
  if (schedule && typeof schedule !== "string") {
    return migrateScheduled(sub, schedule, newPriceId);
  }

  const periodEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;
  const note = `→ ${newPriceId} from ${isoDate(periodEnd)}`;
  if (!apply) return { outcome: "migrated", note };

  const created = await stripe.subscriptionSchedules.create(
    { from_subscription: sub.id },
    { idempotencyKey: `migrate-cycle-${sub.id}-create` },
  );
  await switchAtPeriodEnd(created.id, created.phases[0], newPriceId, sub.metadata);
  return { outcome: "migrated", note };
}

/**
 * The member already has a schedule — normally a downgrade waiting for their
 * renewal. Keep the current phase and point the next one at the 35-day
 * version of whatever tier it was going to.
 */
async function migrateScheduled(sub, schedule, newPriceId) {
  const [current, ...later] = schedule.phases.filter((p) => p.end_date > now);
  if (!current) {
    return skip(`schedule ${schedule.id} has no current phase; migrate by hand`);
  }
  if (later.length > 1) {
    return skip(`schedule ${schedule.id} has ${later.length} upcoming phases; migrate by hand`);
  }

  // No upcoming phase: an earlier --apply run created the schedule but stopped
  // before adding the switch. Finish that job.
  const nextPrice = later[0] ? priceOf(later[0].items[0]) : priceOf(current.items[0]);
  if (!priceMap.has(nextPrice)) {
    return skip(`schedule ${schedule.id} already moves to ${nextPrice}`);
  }
  const targetPrice = later[0] ? priceMap.get(nextPrice) : newPriceId;

  const note = `schedule ${schedule.id}: → ${targetPrice} from ${isoDate(current.end_date)}`;
  if (!apply) return { outcome: "migrated", note };

  await switchAtPeriodEnd(
    schedule.id,
    current,
    targetPrice,
    later[0]?.metadata ?? sub.metadata,
  );
  return { outcome: "migrated", note };
}

/**
 * Leaves the current phase exactly as billed, then starts `nextPriceId` when
 * it ends. The next phase lasts exactly one 35-day cycle (an end date copied
 * from the old monthly phase would cut it short), then the schedule releases,
 * leaving a plain subscription on the new price.
 */
async function switchAtPeriodEnd(scheduleId, current, nextPriceId, nextMetadata) {
  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: [
      {
        items: current.items.map((i) => ({ price: priceOf(i), quantity: i.quantity ?? 1 })),
        start_date: current.start_date,
        end_date: current.end_date,
        trial_end: current.trial_end && current.trial_end > now ? current.trial_end : undefined,
        metadata: current.metadata,
      },
      {
        items: [{ price: nextPriceId, quantity: 1 }],
        // `iterations` was removed from the Stripe API; `duration` replaces it.
        duration: { interval: "day", interval_count: CYCLE_DAYS },
        metadata: nextMetadata,
      },
    ],
  });
}

function priceOf(item) {
  return typeof item.price === "string" ? item.price : item.price.id;
}

function skip(note) {
  return { outcome: "skipped", note };
}

function isoDate(seconds) {
  return seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : "?";
}
