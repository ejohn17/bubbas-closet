import Link from "next/link";
import { countUnitsByStatus, listUnits } from "@/lib/db/units";
import { StatusPill } from "@/components/StatusPill";
import { UnitActions } from "@/components/admin/UnitActions";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { formatDate } from "@/lib/format";
import type { UnitStatus } from "@/lib/types";

const STATUSES: UnitStatus[] = [
  "available",
  "reserved",
  "out",
  "cleaning",
  "retired",
];

export default async function AdminUnits({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  const active = STATUSES.includes(status as UnitStatus) ? (status as UnitStatus) : "";

  const [counts, units] = await Promise.all([
    countUnitsByStatus(),
    listUnits({ status: active || undefined, search }),
  ]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
      <p className="mt-2 text-stone">
        Every physical garment, tracked individually.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <FilterTabs
          basePath="/admin/units"
          current={active}
          extraParams={{ search: search || undefined }}
          options={[
            { value: "", label: "All", count: total },
            ...STATUSES.map((s) => ({
              value: s,
              label: s === "out" ? "Out with members" : s,
              count: counts[s],
            })),
          ]}
        />
        <div className="w-full max-w-xs">
          <AdminSearch placeholder="Search by style or SKU" defaultValue={search ?? ""} />
        </div>
      </div>

      {units.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-stone">
          Nothing here.{" "}
          <Link href="/admin/products" className="link text-ink">
            Add inventory from a product
          </Link>
          .
        </p>
      ) : (
        <ul className="card mt-8 divide-y divide-line">
          {units.map((unit) => (
            <li
              key={unit.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  <Link
                    href={`/admin/products/${unit.productId}`}
                    className="hover:text-accent-dark"
                  >
                    {unit.productTitle}
                  </Link>
                  <span className="ml-2 font-normal text-stone">
                    size {unit.size}
                  </span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-stone">
                  <StatusPill status={unit.status} />
                  <span>{unit.sku ?? unit.id.slice(0, 6)}</span>
                  {unit.pickId ? (
                    <Link
                      href={`/admin/orders/${unit.pickId}`}
                      className="link text-stone"
                    >
                      on order
                    </Link>
                  ) : null}
                  <span>added {formatDate(unit.createdAt)}</span>
                </p>
              </div>

              <UnitActions
                unitId={unit.id}
                status={unit.status}
                condition={unit.condition}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
