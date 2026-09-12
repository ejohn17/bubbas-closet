import Link from "next/link";
import { listProducts } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { ProductImage } from "@/components/ProductImage";
import { AdminSearch } from "@/components/admin/AdminSearch";

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const [products, availability] = await Promise.all([
    listProducts({ search }),
    availabilityByProduct(),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
          <p className="mt-2 text-stone">
            Styles in the closet. Inventory is tracked per garment inside each
            style.
          </p>
        </div>
        <Link href="/admin/products/new" className="btn-primary">
          New product
        </Link>
      </div>

      <div className="mt-6 max-w-sm">
        <AdminSearch placeholder="Search products" defaultValue={search ?? ""} />
      </div>

      {products.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-stone">
          {search
            ? "No products match that search."
            : "No products yet. Create your first style to start stocking the closet."}
        </p>
      ) : (
        <ul className="mt-8 card divide-y divide-line">
          {products.map((product) => {
            const stock = availability[product.id];

            return (
              <li key={product.id}>
                <Link
                  href={`/admin/products/${product.id}`}
                  className="flex items-center gap-4 p-4 transition hover:bg-cream/60"
                >
                  <ProductImage
                    src={product.images[0]}
                    alt={product.title}
                    className="h-16 w-14 shrink-0 rounded-xl"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {product.title}
                      {!product.active ? (
                        <span className="ml-2 text-xs font-normal text-stone">
                          hidden
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-stone">
                      {[product.brand, product.category]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>

                  <div className="hidden text-right text-sm sm:block">
                    <p className="font-medium">{stock?.total ?? 0} available</p>
                    <p className="text-stone">
                      {product.sizes.length
                        ? product.sizes.join(", ")
                        : "no sizes yet"}
                    </p>
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
