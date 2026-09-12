/**
 * Children's clothing sizes come in as free text. Inventory uses forms like
 * 0m, 6M, 12M-18M, 2Y, 2Y-3Y — unit on one side or both. String sort puts
 * 2Y before 3M-6M; this orders them by age instead.
 */

const UNIT = "(months?|mos?|m|years?|yrs?|y|t)";
const NUM = "(\\d+(?:\\.\\d+)?)";

function unitToMonths(value: number, unit: string): number {
  const kind = unit.toLowerCase();
  if (kind === "t" || kind.startsWith("y")) return value * 12;
  return value;
}

function normalizeSize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Approximate age in months. Singles use the exact age; ranges use the start
 * plus a fraction so 6M comes before 6M-9M, and 2Y before 2Y-3Y.
 */
export function sizeSortKey(raw: string): number {
  const size = normalizeSize(raw);
  if (!size) return Number.POSITIVE_INFINITY;
  if (/^(p|preemie|prem)$/.test(size)) return -1;
  if (/^(nb|newborn|n)$/.test(size)) return 0;

  const bothSides = size.match(
    new RegExp(
      `^${NUM}\\s*${UNIT}\\s*(?:[-–—/]|to)\\s*${NUM}\\s*${UNIT}$`,
    ),
  );
  if (bothSides) {
    return unitToMonths(Number(bothSides[1]), bothSides[2]) + 0.5;
  }

  const endUnit = size.match(
    new RegExp(`^${NUM}\\s*(?:[-–—/]|to)\\s*${NUM}\\s*${UNIT}$`),
  );
  if (endUnit) {
    return unitToMonths(Number(endUnit[1]), endUnit[3]) + 0.5;
  }

  const single = size.match(new RegExp(`^${NUM}\\s*${UNIT}$`));
  if (single) {
    return unitToMonths(Number(single[1]), single[2]);
  }

  const bareRange = size.match(
    new RegExp(`^${NUM}\\s*(?:[-–—/]|to)\\s*${NUM}$`),
  );
  if (bareRange) return Number(bareRange[1]) + 0.5;

  const bare = size.match(new RegExp(`^${NUM}$`));
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
