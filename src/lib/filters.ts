/**
 * Facet helpers for closet and admin lists. Category, brand, and tags are
 * free-text on the product form, so filters are built from whatever is stocked.
 */

export function uniqueLabels(
  values: Iterable<string | undefined | null>,
): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function matchesLabel(
  value: string | undefined | null,
  selected: string,
): boolean {
  if (!selected) return true;
  return (value ?? "").trim().toLowerCase() === selected.trim().toLowerCase();
}

export function hasTag(
  tags: Iterable<string> | undefined,
  selected: string,
): boolean {
  if (!selected) return true;
  return [...(tags ?? [])].some((tag) => matchesLabel(tag, selected));
}
