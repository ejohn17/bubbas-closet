import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/db/products";
import { listUnits } from "@/lib/db/units";
import { ProductForm } from "@/components/admin/ProductForm";
import { AddUnitsForm } from "@/components/admin/AddUnitsForm";
import { UnitActions } from "@/components/admin/UnitActions";
import { StatusPill } from "@/components/StatusPill";
import { BackToListLink } from "@/components/BackToListLink";

export default async function AdminProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const units = await listUnits({ productId: id });
  const available = units.filter((u) => u.status === "available").length;
  const inInventory = units.filter((u) => u.status !== "sold").length;

  return (
    <div className="mx-auto max-w-3xl">
      <BackToListLink href="/admin/products" label="Products" />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
        <p className="text-sm text-stone">
          {available} of {inInventory} garments available
          {units.length > inInventory
            ? ` · ${units.length - inInventory} sold`
            : ""}
        </p>
      </div>

      <section className="mt-10">
        <ProductForm
          initial={{
            id: product.id,
            title: product.title,
            brand: product.brand ?? "",
            category: product.category ?? "",
            description: product.description,
            tags: product.tags.join(", "),
            sizes: product.sizes.join(", "),
            retailValue: product.retailValueCents
              ? String(product.retailValueCents / 100)
              : "",
            purchasePrice: product.purchasePriceCents
              ? (product.purchasePriceCents / 100).toFixed(2)
              : "",
            images: product.images,
            active: product.active,
          }}
        />
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <p className="mt-1 mb-6 text-sm text-stone">
          Each row is a physical garment with its own history.
        </p>

        <AddUnitsForm productId={product.id} suggestedSizes={product.sizes} />

        {units.length === 0 ? (
          <p className="card mt-8 p-6 text-sm text-stone">
            No garments yet — add some above and this style becomes rentable.
          </p>
        ) : (
          <ul className="card mt-8 divide-y divide-line">
            {units.map((unit) => (
              <li
                key={unit.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Size {unit.size}
                    <span className="ml-2 font-normal text-stone">
                      {unit.sku ?? unit.id.slice(0, 6)}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-stone">
                    <StatusPill status={unit.status} />
                    {unit.status === "sold" && unit.pickId ? (
                      <Link
                        href={`/admin/orders/${unit.pickId}`}
                        className="link text-stone"
                      >
                        view sale
                      </Link>
                    ) : null}
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
      </section>
    </div>
  );
}
