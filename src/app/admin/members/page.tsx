import Link from "next/link";
import { listAllSubscriptions } from "@/lib/db/subscriptions";
import { getUser } from "@/lib/db/users";
import { listPicks } from "@/lib/db/picks";
import { StatusPill } from "@/components/StatusPill";
import { getTier } from "@/lib/tiers";
import { formatDate } from "@/lib/format";

export default async function AdminMembers() {
  const subscriptions = await listAllSubscriptions();

  const rows = await Promise.all(
    subscriptions.map(async (sub) => {
      const [member, picks] = await Promise.all([
        getUser(sub.uid),
        listPicks({ uid: sub.uid }),
      ]);
      const outstanding = picks
        .filter((p) => p.status === "shipped" || p.status === "partially_returned")
        .reduce((n, p) => n + p.items.filter((i) => !i.returnedAt).length, 0);

      return { sub, member, picks: picks.length, outstanding };
    }),
  );

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
      <p className="mt-2 text-stone">
        Memberships synced from Stripe. Billing changes are made in Stripe or by
        the member.
      </p>

      {rows.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-stone">
          No memberships yet.
        </p>
      ) : (
        <ul className="card mt-8 divide-y divide-line">
          {rows.map(({ sub, member, picks, outstanding }) => {
            const tier = getTier(sub.tierId);
            const pendingTier = getTier(sub.pendingTierId ?? "");

            return (
              <li
                key={sub.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {member?.name || member?.email || sub.uid}
                  </p>
                  <p className="mt-0.5 text-sm text-stone">
                    {tier?.name ?? sub.tierId} · {sub.itemLimit} items ·{" "}
                    {sub.cancelAtPeriodEnd ? "ends" : "renews"}{" "}
                    {formatDate(sub.currentPeriodEnd)}
                    {pendingTier ? ` · switching to ${pendingTier.name}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm text-stone">
                  <span>
                    {picks} {picks === 1 ? "rental" : "rentals"}
                  </span>
                  {outstanding > 0 ? (
                    <Link
                      href={`/admin/orders?${new URLSearchParams({
                        status: "shipped",
                        ...(member?.email ? { search: member.email } : {}),
                      }).toString()}`}
                      className="link text-stone"
                    >
                      {outstanding} out
                    </Link>
                  ) : null}
                  <StatusPill status={sub.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
