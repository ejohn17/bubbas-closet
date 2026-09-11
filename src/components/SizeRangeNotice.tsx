import { SIZE_RANGE } from "@/lib/config";

/** Warns before signup that the closet only carries infant through 3T. */
export function SizeRangeNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="note"
      className={`rounded-2xl border border-accent/40 bg-card px-4 py-3 text-sm ${className}`}
    >
      <p className="font-medium text-ink">
        Sizes {SIZE_RANGE.label} only
      </p>
      <p className="mt-1 text-stone">
        This closet is children&apos;s clothing from {SIZE_RANGE.min} through{" "}
        {SIZE_RANGE.max}. If your child is outside that range, a membership
        will not have pieces that fit.
      </p>
    </div>
  );
}
