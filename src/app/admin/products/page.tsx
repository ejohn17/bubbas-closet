import Link from "next/link";
import { listProducts } from "@/lib/db/products";
import { availabilityByProduct } from "@/lib/db/units";
import { hasTag, matchesLabel, uniqueLabels } from "@/lib/filters";
import { ProductImage } from "@/components/ProductImage";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { CollapsibleFilters } from "@/components/CollapsibleFilters";
import { FilterSelectNav, FiltersMenu } from "@/components/FilterSelect";

const NONE = "__none__";

function productsFilterHref(
  params: Record<string, string | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const encoded = query.toString();
  return encoded ? `/admin/products?${encoded}` : "/admin/products";
}

export default async function AdminProducts({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    category?: string;
    brand?: string;
    tag?: string;
    visibility?: string;
  }>;
}) {
  const { search, category = "", brand = "", tag = "", visibility = "" } =
    await searchParams;
  const [allProducts, availability] = await Promise.all([
    listProducts({ search }),
    availabilityByProduct(),
  ]);

  const categories = uniqueLabels(allProducts.map((p) => p.category));
  const brands = uniqueLabels(allProducts.map((p) => p.brand));
  const tags = uniqueLabels(allProducts.flatMap((p) => p.tags ?? []));
  const uncategorized = allProducts.filter((p) => !p.category?.trim()).length;

  const extras = {
    search: search || undefined,
    category: category || undefined,
    brand: brand || undefined,
    tag: tag || undefined,
    visibility: visibility || undefined,
  };

  const products = allProducts.filter((product) => {
    if (category === NONE) {
      if (product.category?.trim()) return false;
    } else if (category && !matchesLabel(product.category, category)) {
      return false;
    }
    if (brand && !matchesLabel(product.brand, brand)) return false;
    if (tag && !hasTag(product.tags, tag)) return false;
    if (visibility === "visible" && !product.active) return false;
    if (visibility === "hidden" && product.active) return false;
    return true;
  });

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

      <div className="mt-6 flex flex-col gap-4">
        <div className="max-w-sm">
          <AdminSearch placeholder="Search products" defaultValue={search ?? ""} />
        </div>

        <FiltersMenu
          activeCount={[category, brand, tag, visibility].filter(Boolean).length}
        >
          <div className="flex flex-wrap gap-3">
            {categories.length > 0 || uncategorized > 0 ? (
              <FilterSelectNav
                label="Category"
                allLabel="All categories"
                basePath="/admin/products"
                param="category"
                current={category}
                extraParams={{ ...extras, category: undefined }}
                options={[
                  ...categories.map((label) => ({
                    value: label,
                    label,
                    count: allProducts.filter((p) =>
                      matchesLabel(p.category, label),
                    ).length,
                  })),
                  ...(uncategorized
                    ? [
                        {
                          value: NONE,
                          label: "Uncategorized",
                          count: uncategorized,
                        },
                      ]
                    : []),
                ]}
              />
            ) : null}
            {brands.length > 0 ? (
              <FilterSelectNav
                label="Brand"
                allLabel="All brands"
                basePath="/admin/products"
                param="brand"
                current={brand}
                extraParams={{ ...extras, brand: undefined }}
                options={brands.map((label) => ({
                  value: label,
                  label,
                  count: allProducts.filter((p) => matchesLabel(p.brand, label))
                    .length,
                }))}
              />
            ) : null}
            <FilterSelectNav
              label="Visibility"
              allLabel="All"
              basePath="/admin/products"
              param="visibility"
              current={visibility}
              extraParams={{ ...extras, visibility: undefined }}
              options={[
                {
                  value: "visible",
                  label: "Visible",
                  count: allProducts.filter((p) => p.active).length,
                },
                {
                  value: "hidden",
                  label: "Hidden",
                  count: allProducts.filter((p) => !p.active).length,
                },
              ]}
            />
          </div>

          {tags.length > 0 ? (
            <CollapsibleFilters
              label="Tags"
              summary={
                tag ? (
                  <Link
                    href={productsFilterHref({ ...extras, tag: undefined })}
                    className="pill border border-ink bg-ink text-cream"
                  >
                    {tag}
                  </Link>
                ) : null
              }
            >
              <FilterTabs
                basePath="/admin/products"
                param="tag"
                current={tag}
                extraParams={{ ...extras, tag: undefined }}
                options={[
                  { value: "", label: "All tags", count: allProducts.length },
                  ...tags.map((label) => ({
                    value: label,
                    label,
                    count: allProducts.filter((p) => hasTag(p.tags, label))
                      .length,
                  })),
                ]}
              />
            </CollapsibleFilters>
          ) : null}
        </FiltersMenu>
      </div>

      {products.length === 0 ? (
        <p className="card mt-8 p-8 text-center text-stone">
          {search || category || brand || tag || visibility
            ? "No products match those filters."
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
