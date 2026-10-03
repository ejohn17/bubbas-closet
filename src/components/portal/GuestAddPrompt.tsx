import Link from "next/link";
import { conditionLabel } from "@/lib/rules";
import type { CatalogSize } from "@/lib/catalog";

/**
 * Stand-in for AddToBoxControls on the public closet: shows what's on the
 * shelf and sends the visitor to create a free account. Holds need an
 * identity, so the piece they were looking at is the destination after signup.
 */
export function GuestAddPrompt({
  productId,
  sizes,
  size = "sm",
}: {
  productId: string;
  sizes: CatalogSize[];
  size?: "sm" | "md";
}) {
  const next = encodeURIComponent(`/portal/item/${productId}`);
  const btn = size === "sm" ? "btn-primary btn-sm" : "btn-primary";

  if (sizes.length === 0) {
    return <p className="text-sm text-stone">All out on loan right now</p>;
  }

  return (
    <div>
      <p className="label">Available in</p>
      <div className="flex flex-wrap gap-1.5">
        {sizes.map(({ size: label, count, condition }) => (
          <span
            key={label}
            title={`${count} available · ${conditionLabel(condition)}`}
            className="rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-ink"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={`/signup?next=${next}`} className={btn}>
          Sign up to add
        </Link>
        <Link
          href={`/login?next=${next}`}
          className="text-sm text-stone transition hover:text-ink"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
