import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/db/products";
import { listUnits } from "@/lib/db/units";
import { ProductForm } from "@/components/admin/ProductForm";
import { AddUnitsForm } from "@/components/admin/AddUnitsForm";
import { UnitActions } from "@/components/admin/UnitActions";
import { StatusPill } from "@/components/StatusPill";

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

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/products" className="text-sm text-stone hover:text-ink">
        ← Products
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{product.title}</h1>
        <p className="text-sm text-stone">
          {available} of {units.length} garments available
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
                  <p className="mt-1">
                    <StatusPill status={unit.status} />
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
