/**
 * Children's clothing sizes come in as free text ("0-3m", "2 year", "3T").
 * String sort puts "2 year" before "3-6m"; this orders them by age instead.
 */

/** Approximate age in months so 0-3m < 3-6m < 2 year / 2T < 3T. */
export function sizeSortKey(raw: string): number {
  const size = raw
    .trim()
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ");

  if (!size) return Number.POSITIVE_INFINITY;
  if (/^(p|preemie|prem)$/.test(size)) return -1;
  if (/^(nb|newborn|n)$/.test(size)) return 0;

  const toddler = size.match(/^(\d+)\s*t$/);
  if (toddler) return Number(toddler[1]) * 12;

  const yearRange = size.match(
    /^(\d+(?:\.\d+)?)\s*(?:[-–—/]|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)$/,
  );
  if (yearRange) return Number(yearRange[1]) * 12;

  const years = size.match(/^(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)$/);
  if (years) return Number(years[1]) * 12;

  const monthRange = size.match(
    /^(\d+(?:\.\d+)?)\s*(?:[-–—/]|to)\s*(\d+(?:\.\d+)?)\s*(?:months?|mos?|m)$/,
  );
  if (monthRange) return Number(monthRange[1]) + 0.01;

  const months = size.match(/^(\d+(?:\.\d+)?)\s*(?:months?|mos?|m)$/);
  if (months) return Number(months[1]);

  const bareRange = size.match(
    /^(\d+(?:\.\d+)?)\s*(?:[-–—/]|to)\s*(\d+(?:\.\d+)?)$/,
  );
  if (bareRange) return Number(bareRange[1]);

  const bare = size.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Number(bare[1]);

  return Number.POSITIVE_INFINITY;
}

export function compareSizes(a: string, b: string): number {
  const byAge = sizeSortKey(a) - sizeSortKey(b);
  if (byAge !== 0) return byAge;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort(compareSizes);
}
