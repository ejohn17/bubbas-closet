import { requireUser } from "@/lib/session";
import { listPicks, isOverdue } from "@/lib/db/picks";
import { ProductImage } from "@/components/ProductImage";
import { StatusPill } from "@/components/StatusPill";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My rentals" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { confirmed } = await searchParams;
  const user = await requireUser("/portal/orders");
  const picks = await listPicks({ uid: user.uid });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">My rentals</h1>
      <p className="mt-2 text-stone">
        Every box you&apos;ve picked, and what still needs to come back.
      </p>

      {confirmed ? (
        <p className="card mt-8 px-5 py-4 text-sm text-stone">
          <span className="font-medium text-ink">Box confirmed.</span> We&apos;re
          packing it now — you&apos;ll get an email when it ships.
        </p>
      ) : null}

      {picks.length === 0 ? (
        <p className="mt-16 text-center text-stone">
          No rentals yet. Your first box will show up here.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {picks.map((pick) => {
            const outstanding = pick.items.filter((i) => !i.returnedAt).length;
            const late = isOverdue(pick);

            return (
              <li key={pick.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {pick.items.length}{" "}
                      {pick.items.length === 1 ? "piece" : "pieces"} ·{" "}
                      {formatDate(pick.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-stone">
                      {pick.trackingNumber
                        ? `${pick.carrier ?? "Tracking"}: ${pick.trackingNumber}`
                        : pick.dueAt
                          ? `Return by ${formatDate(pick.dueAt)}`
                          : "Return details coming soon"}
                    </p>
                  </div>
                  <StatusPill status={late ? "overdue" : pick.status} />
                </div>

                <ul className="mt-4 flex flex-wrap gap-3">
                  {pick.items.map((item) => (
                    <li
                      key={item.unitId}
                      className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2"
                    >
                      <ProductImage
                        src={item.image}
                        alt={item.productTitle}
                        className="h-12 w-10 rounded-lg"
                      />
                      <div className="text-sm">
                        <p className="font-medium">{item.productTitle}</p>
                        <p className="text-stone">
                          Size {item.size}
                          {item.returnedAt ? " · returned" : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                {outstanding > 0 && pick.status !== "pending" ? (
                  <p className="mt-4 text-sm text-stone">
                    {outstanding} {outstanding === 1 ? "piece" : "pieces"} still
                    with you.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
