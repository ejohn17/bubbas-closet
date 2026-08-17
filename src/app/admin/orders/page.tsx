import Link from "next/link";
import { isOverdue, listPicks } from "@/lib/db/picks";
import { StatusPill } from "@/components/StatusPill";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { dueLabel, formatDate } from "@/lib/format";
import type { PickStatus } from "@/lib/types";

const STATUSES: PickStatus[] = [
  "pending",
  "shipped",
  "partially_returned",
  "returned",
  "cancelled",
];

export default async function AdminOrders({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status ?? "";
  const all = await listPicks();

  const picks =
    filter === "overdue"
      ? all.filter((p) => isOverdue(p))
      : STATUSES.includes(filter as PickStatus)
        ? all.filter((p) => p.status === filter)
        : all;

  const counts: Record<string, number> = { overdue: 0 };
  for (const pick of all) {
    counts[pick.status] = (counts[pick.status] ?? 0) + 1;
    if (isOverdue(pick)) counts.overdue += 1;
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-2 text-stone">
        Monthly boxes to pack, ship, and receive back.
      </p>

      <div className="mt-6">
        <FilterTabs
          basePath="/admin/orders"
          current={filter}
          options={[
            { value: "", label: "All", count: all.length },
            { value: "pending", label: "To pack", count: counts.pending },
            { value: "shipped", label: "Shipped", count: counts.shipped },
            { value: "overdue", label: "Overdue", count: counts.overdue },
            {
              value: "partially_returned",
              label: "Part returned",
              count: counts.partially_returned,
            },
            { value: "returned", label: "Complete", count: counts.returned },
          ]}
        />
      </div>

      {picks.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-stone">
          No orders in this view.
        </p>
      ) : (
        <ul className="card mt-8 divide-y divide-line">
          {picks.map((pick) => {
            const outstanding = pick.items.filter((i) => !i.returnedAt).length;
            const late = isOverdue(pick);

            return (
              <li key={pick.id}>
                <Link
                  href={`/admin/orders/${pick.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-cream/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {pick.shippingAddress?.name ?? pick.email ?? "Member"}
                    </p>
                    <p className="mt-0.5 text-sm text-stone">
                      {pick.items.length} items · confirmed{" "}
                      {formatDate(pick.createdAt)}
                      {outstanding > 0 && pick.status !== "pending"
                        ? ` · ${outstanding} outstanding`
                        : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-stone">
                    {pick.status === "shipped" ||
                    pick.status === "partially_returned" ? (
                      <span>{dueLabel(pick.dueAt)}</span>
                    ) : null}
                    <StatusPill status={late ? "overdue" : pick.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
