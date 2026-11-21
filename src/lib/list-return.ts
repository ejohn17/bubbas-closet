/**
 * Remembers where someone was in a list when they followed a link out of it
 * (a piece in the closet, a product or order in admin) so coming back with
 * the "← …" link or the browser's Back button lands on the same row with the
 * same filters instead of the top.
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

export type ListPosition = {
  /** The list's path and query, e.g. /admin/orders?status=pending. */
  listUrl: string;
  /** Where the followed link went, e.g. /admin/orders/abc. */
  itemPath: string;
  /** Which of the list's links to `itemPath` it was; rows can share one. */
  linkIndex: number;
  /** That link's distance from the top of the viewport. */
  linkTop: number;
  /** Fallback when the link is no longer in the list. */
  scrollY: number;
  /** The closet keeps its filters in state; admin lists keep them in the URL. */
  filters?: CatalogFilters;
};

const positions = new Map<string, ListPosition>();
let lastOpened: ListPosition | null = null;
/** Set as navigation heads back to a list; cleared by the next list to mount. */
let returningTo: string | null = null;

/** One spelling of a list's URL, whichever API it came from. */
export const listUrlOf = (pathname: string, search: string) => {
  const query = new URLSearchParams(search).toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const rememberListPosition = (position: ListPosition) => {
  positions.set(position.listUrl, position);
  lastOpened = position;
};

export const forgetListPosition = (listUrl: string) => {
  positions.delete(listUrl);
};

/** The list this page was opened from, if it was the last one followed. */
export const listOpenedFrom = (itemPath: string) =>
  lastOpened?.itemPath === itemPath ? lastOpened.listUrl : null;

export const markReturningTo = (listUrl: string) => {
  returningTo = listUrl;
};

/** The position to restore if this list is being returned to. */
export const pendingListReturn = (listUrl: string) =>
  returningTo === listUrl ? (positions.get(listUrl) ?? null) : null;

export const clearListReturn = () => {
  returningTo = null;
};

// Back and Forward count as returning to wherever they land.
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    markReturningTo(listUrlOf(window.location.pathname, window.location.search));
  });
}
