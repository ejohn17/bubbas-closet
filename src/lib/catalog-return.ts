/**
 * Remembers where someone was in a catalogue list when they opened a piece,
 * so coming back — the "← The closet" link or the browser's Back button —
 * lands them on the same card with the same filters instead of the top.
 *
 * Held in memory on purpose: it only has to survive client-side navigation
 * within one page load. Nothing here is set during SSR or on a fresh load, so
 * the first render always matches the server. After a full reload the
 * browser's own scroll restoration takes over.
 */

export type CatalogFilters = {
  search: string;
  category: string;
  brand: string;
  tag: string;
  condition: string;
  size: string;
  inStockOnly: boolean;
};

export type CatalogPosition = {
  /** List the piece was opened from, e.g. /portal or /portal/favorites. */
  listPath: string;
  /** The piece's page, e.g. /portal/item/abc. */
  itemPath: string;
  itemId: string;
  filters: CatalogFilters;
  /** The card's distance from the top of the viewport when it was opened. */
  cardTop: number;
  /** Fallback when that card is no longer in the list. */
  scrollY: number;
};

let saved: CatalogPosition | null = null;
/** Set as navigation heads back to a list; cleared by the next list to mount. */
let returningTo: string | null = null;

export const rememberCatalogPosition = (position: CatalogPosition) => {
  saved = position;
};

/** The list this piece was opened from, if we know it. */
export const listOpenedFrom = (itemPath: string) =>
  saved?.itemPath === itemPath ? saved.listPath : null;

export const markReturningTo = (listPath: string) => {
  returningTo = listPath;
};

/** The position to restore if this list is being returned to. */
export const pendingCatalogReturn = (listPath: string) =>
  returningTo === listPath && saved?.listPath === listPath ? saved : null;

export const clearCatalogReturn = () => {
  returningTo = null;
};
