import Link from "next/link";
import { notFound } from "next/navigation";
import { getPick, isOverdue } from "@/lib/db/picks";
import { getUnit } from "@/lib/db/units";
import { getUser } from "@/lib/db/users";
import { getPrimarySubscription } from "@/lib/db/subscriptions";
import { getTier } from "@/lib/tiers";
import { ProductImage } from "@/components/ProductImage";
import { StatusPill } from "@/components/StatusPill";
import { OrderActions } from "@/components/admin/OrderActions";
import { dueLabel, formatDate, formatDateTime } from "@/lib/format";

export default async function AdminOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pick = await getPick(id);
  if (!pick) notFound();

  const [member, subscription, units] = await Promise.all([
    getUser(pick.uid),
    getPrimarySubscription(pick.uid),
    Promise.all(pick.items.map((item) => getUnit(item.unitId))),
  ]);
  const skuByUnit = new Map(
    units
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
      .map((unit) => [unit.id, unit.sku]),
  );
  const tier = getTier(pick.tierId);
  const address = pick.shippingAddress;
  const late = isOverdue(pick);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/orders" className="text-sm text-stone hover:text-ink">
        ← Orders
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {address?.name ?? member?.name ?? pick.email ?? "Member"}
          </h1>
          <p className="mt-2 text-stone">
            {pick.items.length} pieces · {tier?.name ?? pick.tierId} · confirmed{" "}
            {formatDateTime(pick.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {late ? <StatusPill status="overdue" /> : null}
          <StatusPill status={pick.status} />
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="text-lg font-semibold">Pick list</h2>
            <ul className="card mt-4 divide-y divide-line">
              {pick.items.map((item) => (
                <li key={item.unitId} className="flex items-center gap-4 p-4">
                  <ProductImage
                    src={item.image}
                    alt={item.productTitle}
                    className="h-16 w-14 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.productTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-stone">
                      Size {item.size} ·{" "}
                      {item.sku ??
                        skuByUnit.get(item.unitId) ??
                        `unit ${item.unitId.slice(0, 6)}`}
                    </p>
                  </div>
                  <span className="text-xs text-stone">
                    {item.returnedAt
                      ? `Returned ${formatDate(item.returnedAt)}`
                      : "With member"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <OrderActions
            pickId={pick.id}
            status={pick.status}
            items={pick.items.map((item) => ({
              unitId: item.unitId,
              productTitle: item.productTitle,
              size: item.size,
              sku: item.sku ?? skuByUnit.get(item.unitId),
              returnedAt: item.returnedAt ?? null,
            }))}
            carrier={pick.carrier}
            trackingNumber={pick.trackingNumber}
            notes={pick.notes}
            feeCents={pick.feeCents}
          />
        </div>

        <aside className="flex flex-col gap-6">
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Ship to</h2>
            {address ? (
              <address className="mt-3 text-sm not-italic leading-relaxed text-stone">
                {address.name}
                <br />
                {address.line1}
                {address.line2 ? (
                  <>
                    <br />
                    {address.line2}
                  </>
                ) : null}
                <br />
                {address.city}, {address.region} {address.postalCode}
                <br />
                {address.country}
              </address>
            ) : (
              <p className="mt-3 text-sm text-stone">No address on file.</p>
            )}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Timeline</h2>
            <dl className="mt-3 flex flex-col gap-2 text-stone">
              <div className="flex justify-between gap-3">
                <dt>Confirmed</dt>
                <dd>{formatDate(pick.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Shipped</dt>
                <dd>{formatDate(pick.shippedAt)}</dd>
              </div>
              {pick.trackingNumber ? (
                <div className="flex justify-between gap-3">
                  <dt>Tracking</dt>
                  <dd className="truncate text-right">
                    {pick.carrier ? `${pick.carrier} ` : ""}
                    {pick.trackingNumber}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt>Return due</dt>
                <dd>{formatDate(pick.dueAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Returned</dt>
                <dd>{formatDate(pick.returnedAt)}</dd>
              </div>
            </dl>
            {pick.status === "shipped" || pick.status === "partially_returned" ? (
              <p className="mt-3 text-xs text-stone">{dueLabel(pick.dueAt)}</p>
            ) : null}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold">Member</h2>
            <p className="mt-3 text-stone">{member?.email ?? pick.email}</p>
            {subscription ? (
              <p className="mt-2 flex items-center gap-2 text-stone">
                <StatusPill status={subscription.status} />
                {subscription.itemLimit} items / month
              </p>
            ) : null}
            {member?.sizeProfile ? (
              <p className="mt-3 text-xs text-stone">
                Sizes:{" "}
                {[
                  member.sizeProfile.tops && `tops ${member.sizeProfile.tops}`,
                  member.sizeProfile.bottoms &&
                    `bottoms ${member.sizeProfile.bottoms}`,
                  member.sizeProfile.dresses &&
                    `dresses ${member.sizeProfile.dresses}`,
                  member.sizeProfile.shoes && `shoes ${member.sizeProfile.shoes}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
