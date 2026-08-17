/* eslint-disable @next/next/no-img-element */

/**
 * Product imagery comes from arbitrary hosts (Firebase Storage today, a CDN
 * later), so it's rendered with a plain <img> rather than next/image to avoid
 * pinning remote patterns in config. Single place to change if that shifts.
 */
export function ProductImage({
  src,
  alt,
  className = "",
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-line/60 text-xs uppercase tracking-wider text-stone ${className}`}
        aria-hidden
      >
        {alt.slice(0, 1) || "?"}
      </div>
    );
  }

  return (
    <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />
  );
}
