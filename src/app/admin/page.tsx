import Link from "next/link";
import { countUnitsByStatus } from "@/lib/db/units";
import { listPicks, isOverdue } from "@/lib/db/picks";
import { countSubscriptionsByStatus } from "@/lib/db/subscriptions";
import { listProducts } from "@/lib/db/products";
import { StatusPill } from "@/components/StatusPill";
import { dueLabel, formatDate, titleCase } from "@/lib/format";

export default async function AdminOverview() {
  const [units, picks, subs, products] = await Promise.all([
    countUnitsByStatus(),
    listPicks(),
    countSubscriptionsByStatus(),
    listProducts(),
  ]);

  const pending = picks.filter((p) => p.status === "pending");
  const overdue = picks.filter((p) => isOverdue(p));
  const activeMembers = (subs.active ?? 0) + (subs.trialing ?? 0);

  const stats = [
    { label: "Pending to pack", value: pending.length, href: "/admin/orders?status=pending" },
    { label: "Out with members", value: units.out, href: "/admin/units?status=out" },
    { label: "Overdue returns", value: overdue.length, href: "/admin/orders?status=overdue" },
    { label: "Awaiting cleaning", value: units.cleaning, href: "/admin/units?status=cleaning" },
    { label: "Available now", value: units.available, href: "/admin/units?status=available" },
    { label: "Active members", value: activeMembers, href: "/admin/members" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-2 text-stone">
            {products.length} styles · {Object.values(units).reduce((a, b) => a + b, 0)}{" "}
            garments tracked
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/products/new" className="btn-primary">
            New product
          </Link>
        </div>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Link href={stat.href} className="card block p-5 transition hover:border-accent">
              <p className="text-sm text-stone">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {stat.value}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ready to pack</h2>
            <Link href="/admin/orders?status=pending" className="link text-sm text-stone">
              All orders
            </Link>
          </div>

          {pending.length === 0 ? (
            <p className="card mt-4 p-5 text-sm text-stone">
              Nothing waiting — every confirmed box has shipped.
            </p>
          ) : (
            <ul className="card mt-4 divide-y divide-line">
              {pending.slice(0, 6).map((pick) => (
                <li key={pick.id}>
                  <Link
                    href={`/admin/orders/${pick.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition hover:bg-cream/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {pick.shippingAddress?.name ?? pick.email ?? "Member"}
                      </span>
                      <span className="block text-xs text-stone">
                        {pick.items.length} items · confirmed{" "}
                        {formatDate(pick.createdAt)}
                      </span>
                    </span>
                    <StatusPill status={pick.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Overdue returns</h2>
            <Link href="/admin/orders?status=overdue" className="link text-sm text-stone">
              All overdue
            </Link>
          </div>

          {overdue.length === 0 ? (
            <p className="card mt-4 p-5 text-sm text-stone">
              Nothing overdue. Returns are on schedule.
            </p>
          ) : (
            <ul className="card mt-4 divide-y divide-line">
              {overdue.slice(0, 6).map((pick) => (
                <li key={pick.id}>
                  <Link
                    href={`/admin/orders/${pick.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition hover:bg-cream/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {pick.shippingAddress?.name ?? pick.email ?? "Member"}
                      </span>
                      <span className="block text-xs text-stone">
                        {pick.items.filter((i) => !i.returnedAt).length} outstanding ·{" "}
                        {dueLabel(pick.dueAt)}
                      </span>
                    </span>
                    <StatusPill status="overdue" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Memberships</h2>
        {Object.keys(subs).length === 0 ? (
          <p className="card mt-4 p-5 text-sm text-stone">
            No memberships yet. They appear here as soon as Stripe checkout
            completes.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-3">
            {Object.entries(subs).map(([status, count]) => (
              <li key={status} className="card px-5 py-3">
                <span className="text-sm text-stone">{titleCase(status)}</span>
                <span className="ml-3 font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
